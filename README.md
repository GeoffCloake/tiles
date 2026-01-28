# Project

This is a new project.

## Running Locally

Because this project uses ES6 modules (`import`/`export`), you cannot simply open `index.html` in a browser. You must serve it via a local web server.

### Option 1: VS Code Live Server (Recommended)
1.  Install the **Live Server** extension in VS Code.
2.  Right-click `index.html` and select **"Open with Live Server"**.

### Option 2: Node.js http-server
1.  Ensure Node.js is installed.
2.  Open a terminal in this directory.
3.  Run: `npx http-server`
4.  Open the URL shown (usually `http://127.0.0.1:8080`).

### Option 3: Python
1.  Open a terminal in this directory.
2.  Run: `python -m http.server`
3.  Open `http://localhost:8000`.
