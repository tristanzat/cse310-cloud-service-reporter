// Express for requests, cors so react can connect to it, sqlite for database
import express from 'express';
import cors from 'cors';
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./services.db', (err) => {
    if (err) console.error(err.message);
    console.log("Connected to database");
});

