import "dotenv/config"
import express from 'express';
import errorHandler from './src/middleware/error-handler.js';
import { db } from "./db/config.js";
import cors from 'cors';
import { mainRouter } from "./src/api/routes.js";
import {authenticateUser} from "./src/middleware/authentication.js"

const app = express();
const port = process.env.PORT || 3777;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', authenticateUser, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

//main router
app.use('/api', mainRouter)

app.use(errorHandler);

// Start server
const startServer = async () => {
  
  try {
     // Test database connection
        const connection = await db.getConnection();
        console.log('Database connection established successfully.');
        connection.release();
    app.listen(port, err => {
      if (err) {
        console.error('Failed to start the server:', err.message);
        process.exit(1);
      }
      console.log(`Server running on port http://localhost:${port}`);
    });
  } catch (error) {
     console.error(
      'Failed to connect to the database. Server not started.',
      error.message,
    );
    process.exit(1);
  }
};

startServer();
