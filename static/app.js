// ============================================================
// TaskItem component (recursive)
// ============================================================
const TaskItem = {
  name: 'task-item',
  props: {
    task: { type: Object, required: true },
    taskTypes: { type: Array, required: true },
  },
  emits: ['advance', 'set-stage', 'change-type', 'rename', 'add-sub', 'delete'],
  computed: {
    taskStages() {
      const tt = this.taskTypes.find(t => t.id === this.task.task_type_id);
      return tt ? tt.stages : [];
    },
    stageIndex() {
      return this.taskStages.findIndex(s => s.id === this.task.current_stage_id);
    },
    stageCircleClass() {
      const idx = this.stageIndex;
      const len = this.taskStages.length;
      if (len === 0 || idx < 0) return 'stage-circle--muted';
      if (idx === 0) return 'stage-circle--muted';
      if (idx === len - 1) return 'stage-circle--filled';
      return 'stage-circle--outlined';
    },
    stageLabel() {
      return this.stageIndex >= 0 ? this.stageIndex + 1 : '?';
    },
  },
  methods: {
    onTitleBlur(e) {
      const val = e.target.value.trim();
      if (val && val !== this.task.title) {
        this.$emit('rename', this.task.id, val);
      }
    },
    onStageChange(e) {
      this.$emit('set-stage', this.task.id, parseInt(e.target.value, 10));
    },
    onTaskTypeChange(e) {
      this.$emit('change-type', this.task.id, parseInt(e.target.value, 10));
    },
    forwardEvent(name, ...args) {
      this.$emit(name, ...args);
    },
  },
  template: `
    <div class="task-item">
      <div class="task-row">
        <span
          class="stage-circle"
          :class="stageCircleClass"
          @click="$emit('advance', task.id)"
          :title="'Click to advance stage'"
        >{{ stageLabel }}</span>

        <select
          class="stage-select"
          :value="task.current_stage_id"
          @change="onStageChange"
        >
          <option v-for="s in taskStages" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>

        <input
          class="task-title"
          :value="task.title"
          @blur="onTitleBlur"
          @keydown.enter.prevent="$event.target.blur()"
        />

        <select
          class="stage-select"
          :value="task.task_type_id"
          @change="onTaskTypeChange"
          title="Task type"
          style="margin-right: 4px;"
        >
          <option v-for="tt in taskTypes" :key="tt.id" :value="tt.id">{{ tt.name }}</option>
        </select>

        <button class="task-action-btn" @click="$emit('add-sub', task.id)" title="Add subtask">+sub</button>
        <button class="task-delete-btn" @click="$emit('delete', task.id)" title="Delete task">×</button>
      </div>

      <div class="subtasks" v-if="task.subtasks && task.subtasks.length">
        <task-item
          v-for="sub in task.subtasks"
          :key="sub.id"
          :task="sub"
          :task-types="taskTypes"
          @advance="(id) => forwardEvent('advance', id)"
          @set-stage="(id, stageId) => forwardEvent('set-stage', id, stageId)"
          @change-type="(id, typeId) => forwardEvent('change-type', id, typeId)"
          @rename="(id, title) => forwardEvent('rename', id, title)"
          @add-sub="(id) => forwardEvent('add-sub', id)"
          @delete="(id) => forwardEvent('delete', id)"
        ></task-item>
      </div>
    </div>
  `,
};

// ============================================================
// Vue App
// ============================================================
const { createApp } = Vue;

createApp({
  components: { 'task-item': TaskItem },

  data() {
    return {
      // Auth
      token: '',

      // Data
      categories: [],
      taskTypes: [],
      tasks: [],

      // Selection
      selectedCategoryId: null,

      // UI state
      darkMode: false,
      showTaskTypeModal: false,
      showAddTaskModal: false,
      errorMsg: '',

      // Forms
      newTaskForm: { title: '', task_type_id: '', parent_task_id: null },
      typeForm: { id: null, name: '', stages: '' },

      // Dialog
      dialog: {
        show: false,
        type: 'confirm',
        title: '',
        message: '',
        input: '',
        placeholder: '',
        resolve: null,
        isDanger: false,
        confirmText: 'OK',
      },

      // Toasts
      toasts: [],
    };
  },

  computed: {
    selectedCategory() {
      return this.categories.find(c => c.id === this.selectedCategoryId) || null;
    },
  },

  async created() {
    // --- Token: read from ?token= URL param or sessionStorage ---
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      sessionStorage.setItem('stagedoer-token', urlToken);
      // Clean token from URL bar without reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
    this.token = urlToken || sessionStorage.getItem('stagedoer-token') || '';

    // --- Dark mode ---
    this.darkMode = localStorage.getItem('stagedoer-dark') === 'true';
    document.documentElement.classList.toggle('dark', this.darkMode);
    // Enable transitions after a short delay to avoid flash
    setTimeout(() => {
      document.body.classList.add('transitions-ready');
    }, 100);

    // --- Bootstrap data ---
    await Promise.all([this.fetchCategories(), this.fetchTaskTypes()]);
    if (this.categories.length) {
      await this.selectCategory(this.categories[0].id);
    }
  },

  methods: {
    // ----------------------------------------------------------
    // API helper
    // ----------------------------------------------------------
    async api(method, path, body) {
      // Use exact path provided so FastAPI routes match without a 307 redirect
      const url = `/api${path}`;
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) {
        this.errorMsg = data.detail || `Error ${res.status}`;
        throw new Error(data.detail);
      }
      return data;
    },

    // ----------------------------------------------------------
    // Dialogs
    // ----------------------------------------------------------
    openConfirm(title, message, isDanger = false, confirmText = 'Confirm') {
      return new Promise(resolve => {
        this.dialog = { show: true, type: 'confirm', title, message, input: '', resolve, isDanger, confirmText };
      });
    },
    openPrompt(title, placeholder = '') {
      return new Promise(resolve => {
        this.dialog = { show: true, type: 'prompt', title, message: '', input: '', placeholder, resolve, isDanger: false, confirmText: 'OK' };
        this.$nextTick(() => {
          if (this.$refs.dialogInput) this.$refs.dialogInput.focus();
        });
      });
    },
    closeDialog(confirmed) {
      this.dialog.show = false;
      if (this.dialog.resolve) {
        if (this.dialog.type === 'prompt') {
          this.dialog.resolve(confirmed ? this.dialog.input : null);
        } else {
          this.dialog.resolve(confirmed);
        }
        this.dialog.resolve = null;
      }
    },

    // ----------------------------------------------------------
    // Toasts
    // ----------------------------------------------------------
    showToast(message, type = 'success') {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 3000);
    },
    removeToast(id) {
      this.toasts = this.toasts.filter(t => t.id !== id);
    },

    // ----------------------------------------------------------
    // Theme
    // ----------------------------------------------------------
    toggleDark() {
      this.darkMode = !this.darkMode;
      document.documentElement.classList.toggle('dark', this.darkMode);
      localStorage.setItem('stagedoer-dark', this.darkMode);
    },

    // ----------------------------------------------------------
    // Categories
    // ----------------------------------------------------------
    async fetchCategories() {
      this.categories = await this.api('GET', '/categories/');
    },

    async addCategory() {
      const name = await this.openPrompt('New Category', 'Category name...');
      if (!name || !name.trim()) return;
      const cat = await this.api('POST', '/categories/', { name: name.trim() });
      this.categories.push(cat);
      this.showToast(`Category "${cat.name}" created`);
    },

    async deleteCategory(id) {
      const confirmed = await this.openConfirm('Delete Category', 'Delete this category and all its tasks?', true, 'Delete');
      if (!confirmed) return;
      await this.api('DELETE', `/categories/${id}`);
      this.categories = this.categories.filter(c => c.id !== id);
      this.showToast('Category deleted');
      if (this.selectedCategoryId === id) {
        this.tasks = [];
        this.selectedCategoryId = this.categories[0]?.id || null;
        if (this.selectedCategoryId) await this.fetchTasks(this.selectedCategoryId);
      }
    },

    async renameCategory(id, oldName) {
      const newName = await this.openPrompt('Rename Category', oldName);
      if (!newName || !newName.trim() || newName.trim() === oldName) return;
      const cat = await this.api('PUT', `/categories/${id}`, { name: newName.trim() });
      const idx = this.categories.findIndex(c => c.id === id);
      if (idx !== -1) {
        this.categories[idx] = cat;
      }
      this.showToast(`Category renamed to "${cat.name}"`);
    },

    async selectCategory(id) {
      this.selectedCategoryId = id;
      await this.fetchTasks(id);
    },

    // ----------------------------------------------------------
    // Task Types
    // ----------------------------------------------------------
    async fetchTaskTypes() {
      this.taskTypes = await this.api('GET', '/task-types/');
    },

    async saveTaskType() {
      const { id, name, stages } = this.typeForm;
      if (!name.trim() || !stages.trim()) return;
      const stageList = stages.split(',').map(s => s.trim()).filter(Boolean);

      if (id) {
        // Edit
        const tt = this.taskTypes.find(t => t.id === id);
        let updatedTt = tt;
        if (name.trim() !== tt.name) {
          updatedTt = await this.api('PUT', `/task-types/${id}`, { name: name.trim() });
        }
        
        const currentStagesStr = tt.stages.map(s => s.name).join(', ');
        const newStagesStr = stageList.join(', ');
        
        if (newStagesStr !== currentStagesStr) {
          const unmappedExisting = [...tt.stages];
          const unmappedNewIndices = [];
          const stagesPayload = new Array(stageList.length);
          
          // Pass 1: exact matches
          for (let i = 0; i < stageList.length; i++) {
            const stgName = stageList[i];
            const matchIdx = unmappedExisting.findIndex(s => s.name === stgName);
            if (matchIdx !== -1) {
              const existing = unmappedExisting.splice(matchIdx, 1)[0];
              stagesPayload[i] = { id: existing.id, name: stgName, position: i };
            } else {
              unmappedNewIndices.push(i);
            }
          }
          
          // Pass 2: pair up remaining
          for (const i of unmappedNewIndices) {
            const stgName = stageList[i];
            if (unmappedExisting.length > 0) {
              const existing = unmappedExisting.shift();
              stagesPayload[i] = { id: existing.id, name: stgName, position: i };
            } else {
              stagesPayload[i] = { id: null, name: stgName, position: i };
            }
          }
          
          updatedTt = await this.api('PUT', `/task-types/${id}/stages`, stagesPayload);
        }
        
        const idx = this.taskTypes.findIndex(t => t.id === id);
        if (idx !== -1) {
          this.taskTypes[idx] = updatedTt;
        }
        this.showToast(`Task type updated`);
        this.cancelEditTaskType();
      } else {
        // Create
        const tt = await this.api('POST', '/task-types/', { name: name.trim(), stages: stageList });
        this.taskTypes.push(tt);
        this.typeForm = { id: null, name: '', stages: '' };
        this.showToast(`Task type "${tt.name}" created`);
      }
    },

    async deleteTaskType(id) {
      const confirmed = await this.openConfirm('Delete Task Type', 'Delete this task type?', true, 'Delete');
      if (!confirmed) return;
      try {
        await this.api('DELETE', `/task-types/${id}`);
        this.taskTypes = this.taskTypes.filter(t => t.id !== id);
        this.showToast('Task type deleted');
      } catch {
        // errorMsg already set in api()
      }
    },

    editTaskType(tt) {
      this.typeForm = {
        id: tt.id,
        name: tt.name,
        stages: tt.stages.map(s => s.name).join(', ')
      };
    },

    cancelEditTaskType() {
      this.typeForm = { id: null, name: '', stages: '' };
    },

    // ----------------------------------------------------------
    // Tasks
    // ----------------------------------------------------------
    async fetchTasks(categoryId) {
      this.tasks = await this.api('GET', `/tasks/?category_id=${categoryId}`);
    },

    openAddTask(parentTaskId) {
      this.newTaskForm = {
        title: '',
        task_type_id: this.taskTypes[0]?.id || '',
        parent_task_id: parentTaskId || null,
      };
      this.showAddTaskModal = true;
    },

    async addTask() {
      const { title, task_type_id, parent_task_id } = this.newTaskForm;
      if (!title.trim() || !task_type_id) return;
      const newTask = await this.api('POST', '/tasks/', {
        title: title.trim(),
        category_id: this.selectedCategoryId,
        task_type_id: parseInt(task_type_id, 10),
        parent_task_id: parent_task_id || null,
      });
      if (parent_task_id) {
        this.tasks = addSubtaskToTree(this.tasks, parent_task_id, newTask);
      } else {
        this.tasks.push(newTask);
      }
      this.showAddTaskModal = false;
    },

    async deleteTask(id) {
      const confirmed = await this.openConfirm('Delete Task', 'Are you sure you want to delete this task?', true, 'Delete');
      if (!confirmed) return;
      await this.api('DELETE', `/tasks/${id}`);
      this.tasks = removeTaskFromTree(this.tasks, id);
      this.showToast('Task deleted');
    },

    async updateTaskTitle(id, title) {
      const updated = await this.api('PUT', `/tasks/${id}`, { title });
      this.tasks = replaceTaskInTree(this.tasks, updated);
    },

    async advanceStage(id) {
      const updated = await this.api('POST', `/tasks/${id}/advance-stage`);
      this.tasks = replaceTaskInTree(this.tasks, updated);
    },

    async setStage(id, stageId) {
      const updated = await this.api('PUT', `/tasks/${id}`, { current_stage_id: stageId });
      this.tasks = replaceTaskInTree(this.tasks, updated);
    },

    async changeTaskType(id, typeId) {
      const updated = await this.api('PUT', `/tasks/${id}`, { task_type_id: typeId });
      this.tasks = replaceTaskInTree(this.tasks, updated);
    },
  },
}).mount('#app');

// ============================================================
// Tree helpers (pure functions)
// ============================================================

function replaceTaskInTree(list, updated) {
  return list.map(t => {
    if (t.id === updated.id) {
      // Preserve subtasks from old tree in case the updated response has empty subtasks
      return { ...updated, subtasks: updated.subtasks?.length ? updated.subtasks : t.subtasks };
    }
    if (t.subtasks && t.subtasks.length) {
      return { ...t, subtasks: replaceTaskInTree(t.subtasks, updated) };
    }
    return t;
  });
}

function removeTaskFromTree(list, id) {
  return list
    .filter(t => t.id !== id)
    .map(t => ({
      ...t,
      subtasks: t.subtasks ? removeTaskFromTree(t.subtasks, id) : [],
    }));
}

function addSubtaskToTree(list, parentId, newTask) {
  return list.map(t => {
    if (t.id === parentId) {
      return { ...t, subtasks: [...(t.subtasks || []), newTask] };
    }
    if (t.subtasks && t.subtasks.length) {
      return { ...t, subtasks: addSubtaskToTree(t.subtasks, parentId, newTask) };
    }
    return t;
  });
}
