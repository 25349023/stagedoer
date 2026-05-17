# StageDoer

> A powerful, intuitive, multi-stage todo list and project management web application.

StageDoer takes traditional todo lists to the next level. Instead of simple binary "done/not done" checkboxes, StageDoer lets you define custom multi-stage workflows (e.g., *Todo → In Progress → Review → Done*) tailored to your projects. With robust support for nested subtasks at any depth, clean category organization, and lightning-fast reactivity, managing complex tasks has never been easier.


## ✨ Features

- **Custom Task Workflows:** Create flexible task types with custom stage pipelines to match your exact workflow.
- **Infinite Nested Subtasks:** Break down ambitious goals into manageable subtasks, nested as deeply as you need.
- **Category Organization:** Group tasks into organized project categories with intuitive drag-and-drop reordering.
- **Interactive Stage Indicators:** Click a task's progress circle to instantly advance it to the next stage, or jump directly to any specific stage using the inline menu.
- **Built-in Dark & Light Modes:** Clean, polished interface with instant theme switching that remembers your preference.
- **Secure by Default:** Every server launch automatically generates a unique access token so your personal tasks stay private.


## 🚀 Installation

### Prerequisites
- Python 3.10 or higher

### Setup

1. **Clone the repository** (or navigate to your project folder):
   ```bash
   git clone https://github.com/yourusername/stagedoer.git
   cd stagedoer
   ```

2. **Create a virtual environment & install the application**:
   Using standard `pip`:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
   pip install -e .
   ```
   *(Alternatively, if you use `uv`, you can run `uv sync` or `uv pip install -e .`)*


## 💻 Getting Started

### Starting the Server

To launch the StageDoer server locally, run:

```bash
stagedoer
# or if you use uv,
uv run stagedoer
```

When the server starts, it will output a secure URL with a randomly generated access token directly in your terminal:

```text
============================================================
  StageDoer
  URL: http://localhost:8000/?token=a1b2c3d4e5f60718
============================================================
```

Open the provided URL in your browser to start using StageDoer!

### Public Access (Local Network / Server)

If you want to access StageDoer from another device on your local network or server, run with the `--public` flag to bind to `0.0.0.0`:

```bash
stagedoer --public
```


## 📖 Quick Usage Guide

1. **Categories:** Use the left sidebar to add new categories. Drag and drop categories to reorder them to your liking.
2. **Managing Task Types:** Click **"Manage Task Types"** in the top navigation bar to create new workflow templates. For example, you can create a "Content" type with stages: *Idea, Draft, Editing, Published*.
3. **Creating Tasks:** In the main area, click **"+ Add Task"**, enter a title, and select the task type.
4. **Tracking Progress:** Click the numbered circle next to any task to advance it to the next stage.
5. **Subtasks:** Click **"+ sub"** on any existing task to add nested steps. Subtasks inherit the flexibility of independent tasks while staying cleanly organized under their parent.


## ⚠️ Disclaimer

This application was developed primarily through "vibe-coding" (AI-assisted rapid prototyping). While fully functional, the codebase has not undergone formal security audits. Please be aware of potential security risks and vulnerabilities—particularly when using the `--public` flag on untrusted networks or hosting in multi-user environments. Use at your own risk.

