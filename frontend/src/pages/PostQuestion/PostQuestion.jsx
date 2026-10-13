/**
 * PostQuestion: ask form plus AI Draft Coach, then POST /api/questions.
 * Route: `/questions/ask`.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bold,
  CheckCircle2,
  Code,
  Italic,
  Link2,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  createQuestion,
  generateQuestionDraftCoach,
} from '../../services/question/question.service.js';
import styles from './PostQuestion.module.css';

/** Minimum trimmed title length required by the API. */
const TITLE_MIN = 5;
/** Maximum title length required by the API. */
const TITLE_MAX = 255;
/** Minimum trimmed details length required by the API. */
const CONTENT_MIN = 10;

const URL_RE = /^https?:\/\/\S+$/;

/** Returns true when pasted text looks like a code snippet. */
function looksLikeCode(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  const hasIndent = lines.some(l => /^[ \t]{2,}\S/.test(l));
  const hasSyntax = /[{}();]|=>|->/.test(text) ||
    /\b(def |function |const |let |var |class |import |return |print\(|console\.)/.test(text);
  return hasIndent || hasSyntax;
}

/** Guesses a language tag for a fenced code block. */
function detectLang(code) {
  if (/^\s*<(!DOCTYPE|html|head|body|div|p |span|a |ul|ol|li|script|style|form|input)/im.test(code))
    return 'html';
  if (/\bdef \w+\s*\(|^\s*(import |from )\w|:\s*$|\belif\b|\bprint\s*\(/m.test(code))
    return 'python';
  if (/\b(interface |type |enum |namespace )\w/.test(code) ||
    /:\s*(string|number|boolean|void|any)\b/.test(code))
    return 'typescript';
  if (/\b(const|let|var|function|=>|async |await )\b/.test(code)) return 'javascript';
  if (/^\s*[.#]?[\w-]+\s*\{[\s\S]*?\}/m.test(code)) return 'css';
  if (/^\s*SELECT |^\s*INSERT |^\s*UPDATE |^\s*CREATE /im.test(code)) return 'sql';
  return '';
}

/**
 * Renders the ask-question form, optional AI tips, and the published success card.
 *
 * @returns {JSX.Element} The ask page UI.
 */
export default function PostQuestion() {
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);
  const [formData, setFormData] = useState({ title: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ title: null, content: null });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [publishedHash, setPublishedHash] = useState(null);

  const isBusy = isSubmitting || isCoaching;
  const showCoach = Boolean(coachFeedback?.tips?.length);  // returns true if there are tips
  const tips = Array.isArray(coachFeedback?.tips) ? coachFeedback.tips : [];
  const showSuccess = Boolean(success);

  /**
   * Smart paste:
   *  - Bare URL + text selected  → [selected](url)
   *  - Bare URL + no selection   → [](url), cursor between brackets
   *  - Multi-line code snippet   → ```lang\ncode\n```, cursor after block
   *  - Anything else             → default browser paste
   */
  const handleContentPaste = useCallback(
    e => {
      const raw   = e.clipboardData?.getData('text') ?? '';
      const pasted = raw.trim();

      // Already fenced — let it through unchanged
      if (pasted.startsWith('```')) return;

      const el      = textareaRef.current;
      const start   = el?.selectionStart ?? formData.content.length;
      const end     = el?.selectionEnd   ?? formData.content.length;
      const content = formData.content;

      // ── URL paste ────────────────────────────────────────────────────────
      if (URL_RE.test(pasted)) {
        e.preventDefault();
        const hasSelection = start !== end;
        if (hasSelection) {
          const selected = content.slice(start, end);
          const link = `[${selected}](${pasted})`;
          const next = content.slice(0, start) + link + content.slice(end);
          pendingSelection.current = { start: start + link.length, end: start + link.length };
          setFormData(cur => ({ ...cur, content: next }));
        } else {
          const link = `[](${pasted})`;
          const next = content.slice(0, start) + link + content.slice(end);
          pendingSelection.current = { start: start + 1, end: start + 1 };
          setFormData(cur => ({ ...cur, content: next }));
        }
        return;
      }

      // ── Code snippet paste ───────────────────────────────────────────────
      if (looksLikeCode(pasted)) {
        e.preventDefault();
        const lang  = detectLang(pasted);
        const fence = `\`\`\`${lang}\n${pasted}\n\`\`\``;
        const next  = content.slice(0, start) + fence + content.slice(end);
        const cursorPos = start + fence.length;
        pendingSelection.current = { start: cursorPos, end: cursorPos };
        setFormData(cur => ({ ...cur, content: next }));
      }
      // else: normal text — browser handles it
    },
    [formData.content],
  );

  /**
   * Updates one form field and clears that field's validation error.
   *
   * @param {'title'|'content'} field - The field being typed.
   * @returns {(event: import('react').ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void} The input change handler.
   */
  const handleFieldChange = field => event => {
    setFormData(current => ({ ...current, [field]: event.target.value }));
    setFieldErrors(current =>
      current[field] ? { ...current, [field]: null } : current,
    );
  };

  /**
   * Restores the cursor/selection saved by applyMarkdown or applyCodeBlock
   * after React re-renders the controlled textarea with the new value.
   */
  useLayoutEffect(() => {
    if (pendingSelection.current === null) return;
    const { start, end } = pendingSelection.current;
    pendingSelection.current = null;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
  }, [formData.content]);

  /**
   * Wraps the selected details text with markdown markers and restores
   * the cursor to a useful position after the re-render.
   *
   * @param {string} before - Opening markdown.
   * @param {string} [after] - Closing markdown (defaults to `before`).
   * @returns {void}
   */
  const applyMarkdown = (before, after = before) => {
    const content = formData.content;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const hadSelection = start !== end;
    const selected = hadSelection ? content.slice(start, end) : 'text';
    const next =
      content.slice(0, start) + before + selected + after + content.slice(end);

    let selStart, selEnd;
    if (after === '](url)') {
      // Link: select the "url" placeholder so the user can type the URL right away
      selStart = start + before.length + selected.length + 2; // skip `](`
      selEnd = selStart + 3; // length of "url"
    } else if (!hadSelection) {
      // No prior selection: select the "text" placeholder for immediate replacement
      selStart = start + before.length;
      selEnd = selStart + selected.length;
    } else {
      // Had a selection: place cursor after the closing marker
      selStart = start + before.length + selected.length + after.length;
      selEnd = selStart;
    }

    pendingSelection.current = { start: selStart, end: selEnd };
    setFormData(current => ({ ...current, content: next }));
  };

  /**
   * Wraps the selected text in a fenced code block and positions the cursor
   * inside the block for immediate editing.
   *
   * @returns {void}
   */
  const applyCodeBlock = () => {
    const content = formData.content;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const hadSelection = start !== end;
    const selected = hadSelection ? content.slice(start, end) : 'code here';
    const block = '```\n' + selected + '\n```';
    const next = content.slice(0, start) + block + content.slice(end);

    // Select the code content between the fence markers
    pendingSelection.current = {
      start: start + 4, // after "```\n"
      end: start + 4 + selected.length,
    };
    setFormData(current => ({ ...current, content: next }));
  };

  /**
   * Returns field-level messages, or nulls when the draft is ready to send.
   *
   * @returns {{title: string|null, content: string|null}} Title and content error messages.
   */
  const getFieldErrors = () => {
    const title = formData.title.trim();
    const content = formData.content.trim();
    const next = { title: null, content: null };

    if (title.length < TITLE_MIN) {
      next.title = `Question title must be at least ${TITLE_MIN} characters`;
    } else if (title.length > TITLE_MAX) {
      next.title = `Question title must be at most ${TITLE_MAX} characters`;
    }

    if (content.length < CONTENT_MIN) {
      next.content = `Question content must be at least ${CONTENT_MIN} characters`;
    }

    return next;
  };

  /**
   * True when either field failed client-side validation.
   *
   * @param {{title: string|null, content: string|null}} next - Field errors.
   * @returns {boolean} Whether at least one field has an error.
   */
  const hasFieldErrors = next => Boolean(next.title || next.content);

  /**
   * Validates the draft, then asks the AI coach for tips.
   *
   * @returns {Promise<void>} Resolves when coaching finishes or validation fails.
   */
  const handleCoach = async () => {
    setError(null);
    const nextErrors = getFieldErrors();
    setFieldErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      return;
    }

    setIsCoaching(true);
    try {
      const data = await generateQuestionDraftCoach({
        title: formData.title.trim(),
        content: formData.content.trim(),
      });
      // Backend wraps tips under data.data.tips — unwrap it
      setCoachFeedback(data?.data ?? data);
    } catch (err) {
      setCoachFeedback(null);
      setError(err.message);
    } finally {
      setIsCoaching(false);
    }
  };

  /**
   * Validates the draft, posts the question, then shows the success card.
   *
   * @param {import('react').SubmitEvent<HTMLFormElement>} event - The submit event.
   * @returns {Promise<void>} Resolves when posting finishes or validation fails.
   */
  const handleSubmit = async event => {
    event.preventDefault();
    setError(null);
    const nextErrors = getFieldErrors();
    setFieldErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createQuestion({
        title: formData.title.trim(),
        content: formData.content.trim(),
      });
      setPublishedHash(created?.data?.questionHash || null);
      setSuccess('Thread published');
    } catch (err) {
      const message = err.message || 'Failed to post question.';
      setError(
        /please try again/i.test(message)
          ? message
          : `${message.replace(/\.$/, '')}. Please try again.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Clears the form so the user can ask another question.
   *
   * @returns {void} The form is reset to a blank draft.
   */
  const handleAskAnother = () => {
    setFormData({ title: '', content: '' });
    setFieldErrors({ title: null, content: null });
    setCoachFeedback(null);
    setError(null);
    setSuccess(null);
    setPublishedHash(null);
  };

  return (
    <div className={styles.postQuestion}>
      <header className={styles.postQuestion__intro}>
        <p className={styles.postQuestion__eyebrow}>Ask the cohort</p>
        <h2 className={styles.postQuestion__title}>Publish to the forum</h2>
        <p className={styles.postQuestion__lede}>
          Public threads help the whole cohort. Write as if a classmate will
          debug your issue tomorrow. They only know what you put on the page.
        </p>
      </header>

      {showSuccess ? (
        <section className={styles.postQuestion__successCard} role='status'>
          <div className={styles.postQuestion__successIcon} aria-hidden='true'>
            <CheckCircle2 size={36} />
          </div>
          <h3 className={styles.postQuestion__successTitle}>Thread published</h3>
          <p className={styles.postQuestion__successCopy}>
            Your post is indexed for keyword search and embedding-based
            similarity. Share the link in study groups, or stay on the thread to
            answer follow-up questions from peers.
          </p>
          <div className={styles.postQuestion__successActions}>
            <button
              type='button'
              className={styles.postQuestion__textButton}
              onClick={() => navigate('/dashboard')}
            >
              Back to Dashboard
            </button>
            {publishedHash ? (
              <button
                type='button'
                className={styles.postQuestion__submit}
                onClick={() => navigate(`/questions/${publishedHash}`)}
              >
                View Question
              </button>
            ) : null}
            <button
              type='button'
              className={styles.postQuestion__secondary}
              onClick={handleAskAnother}
            >
              Ask Another
            </button>
          </div>
        </section>
      ) : (
        <>
          <aside className={styles.postQuestion__checklist}>
            <h3 className={styles.postQuestion__checklistTitle}>
              Write questions people can answer in one pass
            </h3>
            <p className={styles.postQuestion__checklistCopy}>
              Mentors volunteer their time. Give them runnable context, expected
              vs actual behavior, and a tight scope so they can reproduce the
              issue without guessing your setup.
            </p>
            <p className={styles.postQuestion__checklistHeading}>
              Checklist before you post
            </p>
            <ul className={styles.postQuestion__checklistList}>
              <li>
                <strong>Title as a headline</strong> that states the symptom and
                tech stack (e.g., “React 19: state resets after navigation”).
              </li>
              <li>
                <strong>Repro steps</strong> numbered, with environment (OS,
                browser, Node version) when it matters.
              </li>
              <li>
                <strong>Minimal code</strong> in fenced markdown blocks; trim
                unrelated lines so readers scan faster.
              </li>
              <li>
                <strong>Exact errors</strong> copied verbatim, including stack
                trace snippets when debugging backend routes.
              </li>
            </ul>
            <p className={styles.postQuestion__checklistHeading}>
              Validation rules (enforced by the form)
            </p>
            <ul className={styles.postQuestion__checklistList}>
              <li>
                <strong>Title length:</strong> Must be between {TITLE_MIN} and{' '}
                {TITLE_MAX} characters.
              </li>
              <li>
                <strong>Body length:</strong> Must contain a minimum of{' '}
                {CONTENT_MIN} characters detailing your problem.
              </li>
              <li>
                <strong>Single topic:</strong> Split unrelated bugs into
                separate threads so search and embeddings stay precise.
              </li>
            </ul>
          </aside>

          <form className={styles.postQuestion__form} onSubmit={handleSubmit}>
            {error ? (
              <p className={styles.postQuestion__banner} role='alert'>
                {error}
              </p>
            ) : null}

            <div className={styles.postQuestion__field}>
              <label
                className={styles.postQuestion__label}
                htmlFor='question-title'
              >
                Title
              </label>
              <p className={styles.postQuestion__help}>
                Be specific and imagine you’re asking a question to another
                person.
              </p>
              <input
                id='question-title'
                className={`${styles.postQuestion__input} ${
                  fieldErrors.title ? styles['postQuestion__input--invalid'] : ''
                }`}
                type='text'
                value={formData.title}
                onChange={handleFieldChange('title')}
                placeholder='e.g. How do I handle state management using Context API in React?'
                maxLength={TITLE_MAX}
                disabled={isBusy}
              />
              {fieldErrors.title ? (
                <p className={styles.postQuestion__fieldError} role='alert'>
                  {fieldErrors.title}
                </p>
              ) : null}
            </div>

            <div className={styles.postQuestion__field}>
              <label
                className={styles.postQuestion__label}
                htmlFor='question-content'
              >
                What are the details of your problem?
              </label>
              <p className={styles.postQuestion__help}>
                Introduce the problem and expand on what you put in the title.
                Minimum {CONTENT_MIN} characters.
              </p>
              <div
                className={`${styles.postQuestion__editor} ${
                  fieldErrors.content
                    ? styles['postQuestion__editor--invalid']
                    : ''
                }`}
              >
                <div className={styles.postQuestion__toolbar}>
                  <div className={styles.postQuestion__toolbarGroup}>
                    <button
                      type='button'
                      className={styles.postQuestion__tool}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => applyMarkdown('**')}
                      title='Bold'
                      disabled={isBusy}
                    >
                      <Bold size={15} />
                    </button>
                    <button
                      type='button'
                      className={styles.postQuestion__tool}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => applyMarkdown('*')}
                      title='Italic'
                      disabled={isBusy}
                    >
                      <Italic size={15} />
                    </button>
                    <span className={styles.postQuestion__toolDivider} />
                    <button
                      type='button'
                      className={styles.postQuestion__tool}
                      onMouseDown={e => e.preventDefault()}
                      onClick={applyCodeBlock}
                      title='Code block'
                      disabled={isBusy}
                    >
                      <Code size={15} />
                    </button>
                    <button
                      type='button'
                      className={styles.postQuestion__tool}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => applyMarkdown('[', '](url)')}
                      title='Link — or select text then paste a URL'
                      disabled={isBusy}
                    >
                      <Link2 size={15} />
                    </button>
                  </div>
                  <span className={styles.postQuestion__charCount}>
                    {formData.content.length} characters
                  </span>
                </div>

                <textarea
                  id='question-content'
                  ref={textareaRef}
                  className={styles.postQuestion__textarea}
                  value={formData.content}
                  onChange={handleFieldChange('content')}
                  onPaste={handleContentPaste}
                  placeholder='Include all the information someone would need to answer your question... You can use Markdown to format your code!'
                  rows={10}
                  disabled={isBusy}
                />
              </div>
              {fieldErrors.content ? (
                <p className={styles.postQuestion__fieldError} role='alert'>
                  {fieldErrors.content}
                </p>
              ) : null}
            </div>

            {showCoach ? (
              <section
                className={styles.postQuestion__coach}
                aria-live='polite'
                aria-label='AI draft feedback'
              >
                <h3 className={styles.postQuestion__coachTitle}>AI Feedback</h3>
                <p className={styles.postQuestion__coachText}>
                  Review these suggestions before you post. You still choose
                  what to send.
                </p>
                <ul className={styles.postQuestion__coachList}>
                  {tips.map(tip => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className={styles.postQuestion__coachRow}>
              <button
                type='button'
                className={styles.postQuestion__coachButton}
                onClick={handleCoach}
                disabled={isBusy}
              >
                <Sparkles size={14} />
                {isCoaching ? 'Getting…' : 'AI suggestions'}
              </button>
              <p className={styles.postQuestion__coachHint}>
                Suggestions only. You still choose what to post.
              </p>
            </div>

            <div className={styles.postQuestion__actions}>
              <button
                type='button'
                className={styles.postQuestion__textButton}
                onClick={() => navigate('/dashboard')}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type='submit'
                className={styles.postQuestion__submit}
                disabled={isBusy}
              >
                {isSubmitting ? (
                  'Posting...'
                ) : (
                  <>
                    Post Question
                    <Send size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
