# Overview

This software is a simple web app that displays a financial report of different services. The different services with their costs are stored in a SQLite database.

The program is run locally.

1. Clone this repo
2. Have two terminals, one in `backend` and one in `frontend`
3. In the frontend terminal, run `npm run dev`
4. In the backend terminal, run `npm start`
5. Visit the localhost link found in the frontend terminal

I wrote this software to improve my understanding of SQL databases and how I could interact with them through an API.

[Software Demo Video](http://youtube.com)

# Relational Database

I am using a SQLite database. This is the structure of the table:

| name | provider | category | region | cost | billing_month |
| --- | --- | --- | --- | --- | --- |
| Azure SQL Database | Azure | Database | West US 2 | 410.0 | 2025-10 |

# Development Environment

I developed this using VS Code.

The backend was written in JavaScript using the express, cors, and sqlite3 modules. The frontend was written in JavaScript using the React framework.

# Useful Websites

- [Quick Start - React](https://react.dev/learn)
- [Express - Hello World Example](https://expressjs.com/en/5x/starter/hello-world/)

# Future Work

- Add additional tables with more related data.
- Do more with the cost rather than a plain sum.
