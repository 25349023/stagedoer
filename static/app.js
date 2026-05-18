// ============================================================
// TaskItem component (recursive)
// ============================================================
const TaskItem = {
  name: 'task-item',
  props: {
    task: { type: Object, required: true },
    taskTypes: { type: Array, required: true },
    index: { type: Number },
    isDragOverUp: { type: Boolean, default: false },
    isDragOverDown: { type: Boolean, default: false },
  },
  emits: ['advance', 'set-stage', 'change-type', 'rename', 'add-sub', 'delete', 'dragstart', 'dragover', 'dragleave', 'drop', 'dragend', 'update-task-pos', 'reindex-tasks'],
  data() {
    return {
      draggedSubIndex: null,
      dragOverSubIndex: null,
      isDraggable: false,
    };
  },
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
    onSubDragStart(e, idx) {
      this.draggedSubIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => { if (e.target && e.target.classList) e.target.classList.add('dragging'); }, 0);
    },
    onSubDragOver(e, idx) {
      if (this.draggedSubIndex !== null && this.draggedSubIndex !== idx) {
        this.dragOverSubIndex = idx;
      }
    },
    onSubDragLeave(e, idx) {
      if (this.dragOverSubIndex === idx) this.dragOverSubIndex = null;
    },
    async onSubDrop(e, idx) {
      const fromIndex = this.draggedSubIndex;
      const toIndex = idx;
      this.dragOverSubIndex = null;
      this.draggedSubIndex = null;
      if (e.target && e.target.classList) e.target.classList.remove('dragging');
      if (fromIndex === null || fromIndex === toIndex) return;

      const item = this.task.subtasks.splice(fromIndex, 1)[0];
      this.task.subtasks.splice(toIndex, 0, item);

      const { newPos, needsReindex } = getDropPosition(this.task.subtasks, toIndex);
      item.position = newPos;

      if (needsReindex) {
        applyReindex(this.task.subtasks);
        this.$emit('reindex-tasks', this.task.subtasks);
      } else {
        this.$emit('update-task-pos', item.id, item.position);
      }
    },
    onSubDragEnd(e) {
      if (e.target && e.target.classList) e.target.classList.remove('dragging');
      this.draggedSubIndex = null;
      this.dragOverSubIndex = null;
    },
    onDragStart(e, index) {
      this.$emit('dragstart', e, index);
    },
    onDragEnd(e) {
      this.isDraggable = false;
      this.$emit('dragend', e);
    }
  },
  template: `
    <div class="task-item">
      <div 
        class="task-row"
        :class="{
          'drag-over-up': isDragOverUp,
          'drag-over-down': isDragOverDown
        }"
        :draggable="isDraggable"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="$emit('dragover', $event, index)"
        @dragleave.prevent="$emit('dragleave', $event, index)"
        @drop.stop="$emit('drop', $event, index)"
        @dragend="onDragEnd($event)"
      >
        <span 
          class="drag-handle" 
          style="cursor: grab; color: var(--text-muted); opacity: 0.75; margin-right: 4px;"
          @mousedown="isDraggable = true"
          @mouseup="isDraggable = false"
          @touchstart="isDraggable = true"
          @touchend="isDraggable = false"
          title="Drag to reorder"
        >⋮⋮</span>
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
        <button class="task-delete-btn" @click="$emit('delete', task)" title="Delete task">×</button>
      </div>

      <div class="subtasks" v-if="task.subtasks && task.subtasks.length">
        <task-item
          v-for="(sub, idx) in task.subtasks"
          :key="sub.id"
          :task="sub"
          :task-types="taskTypes"
          :index="idx"
          :is-drag-over-up="dragOverSubIndex === idx && draggedSubIndex !== null && draggedSubIndex > idx"
          :is-drag-over-down="dragOverSubIndex === idx && draggedSubIndex !== null && draggedSubIndex < idx"
          @dragstart="onSubDragStart"
          @dragover="onSubDragOver"
          @dragleave="onSubDragLeave"
          @drop="onSubDrop"
          @dragend="onSubDragEnd"
          @advance="(id) => forwardEvent('advance', id)"
          @set-stage="(id, stageId) => forwardEvent('set-stage', id, stageId)"
          @change-type="(id, typeId) => forwardEvent('change-type', id, typeId)"
          @rename="(id, title) => forwardEvent('rename', id, title)"
          @add-sub="(id) => forwardEvent('add-sub', id)"
          @delete="(t) => forwardEvent('delete', t)"
          @update-task-pos="(id, pos) => forwardEvent('update-task-pos', id, pos)"
          @reindex-tasks="(tasks) => forwardEvent('reindex-tasks', tasks)"
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

      // Drag state
      draggedCatIndex: null,
      dragOverCatIndex: null,
      draggedTaskIndex: null,
      dragOverTaskIndex: null,

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

    onCatDragStart(e, index) {
      this.draggedCatIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      // Use setTimeout to allow the drag image to be generated before adding the class
      setTimeout(() => { if (e.target && e.target.classList) e.target.classList.add('dragging'); }, 0);
    },

    onCatDragOver(e, index) {
      if (this.draggedCatIndex !== null && this.draggedCatIndex !== index) {
        this.dragOverCatIndex = index;
      }
    },

    async onCatDrop(e, index) {
      const fromIndex = this.draggedCatIndex;
      const toIndex = index;

      this.dragOverCatIndex = null;
      this.draggedCatIndex = null;
      if (e.target && e.target.classList) e.target.classList.remove('dragging');

      if (fromIndex === null || fromIndex === toIndex) return;

      const item = this.categories.splice(fromIndex, 1)[0];
      this.categories.splice(toIndex, 0, item);

      const { newPos, needsReindex } = getDropPosition(this.categories, toIndex);
      item.position = newPos;

      if (needsReindex) {
        applyReindex(this.categories);
        await Promise.all(this.categories.map((cat) =>
          this.api('PUT', `/categories/${cat.id}`, { position: cat.position })
        ));
      } else {
        await this.api('PUT', `/categories/${item.id}`, { position: item.position });
      }
    },

    onCatDragEnd(e) {
      if (e.target && e.target.classList) e.target.classList.remove('dragging');
      this.draggedCatIndex = null;
      this.dragOverCatIndex = null;
    },

    async addCategory() {
      const name = await this.openPrompt('New Category', 'Category name...');
      if (!name || !name.trim()) return;
      const cat = await this.api('POST', '/categories/', { name: name.trim() });
      this.categories.push(cat);
      this.showToast(`Category "${cat.name}" created`);
    },

    async deleteCategory(id) {
      const cat = this.categories.find(c => c.id === id);
      const name = cat ? cat.name : 'this category';
      const confirmed = await this.openConfirm('Delete Category', `Delete category "${name}" and all its tasks?`, true, 'Delete');
      if (!confirmed) return;
      await this.api('DELETE', `/categories/${id}`);
      this.categories = this.categories.filter(c => c.id !== id);
      this.showToast(`Category "${name}" deleted`);
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
        this.showToast(`Task type "${updatedTt.name}" updated`);
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
      const tt = this.taskTypes.find(t => t.id === id);
      const name = tt ? tt.name : 'this task type';
      const confirmed = await this.openConfirm('Delete Task Type', `Delete task type "${name}"?`, true, 'Delete');
      if (!confirmed) return;
      try {
        await this.api('DELETE', `/task-types/${id}`);
        this.taskTypes = this.taskTypes.filter(t => t.id !== id);
        this.showToast(`Task type "${name}" deleted`);
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

    async deleteTask(task) {
      const confirmed = await this.openConfirm('Delete Task', `Are you sure you want to delete task "${task.title}"?`, true, 'Delete');
      if (!confirmed) return;
      await this.api('DELETE', `/tasks/${task.id}`);
      this.tasks = removeTaskFromTree(this.tasks, task.id);
      this.showToast(`Task "${task.title}" deleted`);
    },

    async updateTaskTitle(id, title) {
      const updated = await this.api('PUT', `/tasks/${id}`, { title });
      this.tasks = replaceTaskInTree(this.tasks, updated);
    },

    async updateTaskPos(id, pos) {
      await this.api('PUT', `/tasks/${id}`, { position: pos });
    },

    async reindexTasks(tasks) {
      await Promise.all(tasks.map(t => this.api('PUT', `/tasks/${t.id}`, { position: t.position })));
    },

    onTaskDragStart(e, index) {
      this.draggedTaskIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => { if (e.target && e.target.classList) e.target.classList.add('dragging'); }, 0);
    },

    onTaskDragOver(e, index) {
      if (this.draggedTaskIndex !== null && this.draggedTaskIndex !== index) {
        this.dragOverTaskIndex = index;
      }
    },

    onTaskDragLeave(e, index) {
      if (this.dragOverTaskIndex === index) {
        this.dragOverTaskIndex = null;
      }
    },

    async onTaskDrop(e, index) {
      const fromIndex = this.draggedTaskIndex;
      const toIndex = index;

      this.dragOverTaskIndex = null;
      this.draggedTaskIndex = null;
      if (e.target && e.target.classList) e.target.classList.remove('dragging');

      if (fromIndex === null || fromIndex === toIndex) return;

      const item = this.tasks.splice(fromIndex, 1)[0];
      this.tasks.splice(toIndex, 0, item);

      const { newPos, needsReindex } = getDropPosition(this.tasks, toIndex);
      item.position = newPos;

      if (needsReindex) {
        applyReindex(this.tasks);
        await this.reindexTasks(this.tasks);
      } else {
        await this.updateTaskPos(item.id, item.position);
      }
    },

    onTaskDragEnd(e) {
      if (e.target && e.target.classList) e.target.classList.remove('dragging');
      this.draggedTaskIndex = null;
      this.dragOverTaskIndex = null;
    },

    async advanceStage(id) {
      const target = findTaskInTree(this.tasks, id);
      if (!target) return;

      const previousStageId = target.current_stage_id;
      const tt = this.taskTypes.find(t => t.id === target.task_type_id);
      if (!tt || !tt.stages || !tt.stages.length) return;

      const currentIdx = tt.stages.findIndex(s => s.id === previousStageId);
      const nextIdx = (currentIdx + 1) % tt.stages.length;
      const nextStageId = tt.stages[nextIdx].id;

      // Optimistically update local state
      this.tasks = replaceTaskInTree(this.tasks, { ...target, current_stage_id: nextStageId });

      try {
        const updated = await this.api('POST', `/tasks/${id}/advance-stage`);
        this.tasks = replaceTaskInTree(this.tasks, updated);
      } catch (err) {
        // Revert on error
        const currentTarget = findTaskInTree(this.tasks, id);
        if (currentTarget) {
          this.tasks = replaceTaskInTree(this.tasks, { ...currentTarget, current_stage_id: previousStageId });
        }
        this.showToast('Failed to advance stage. Reverted change.', 'error');
      }
    },

    async setStage(id, stageId) {
      const target = findTaskInTree(this.tasks, id);
      if (!target) return;

      const previousStageId = target.current_stage_id;
      if (previousStageId === stageId) return;

      // Optimistically update local state
      this.tasks = replaceTaskInTree(this.tasks, { ...target, current_stage_id: stageId });

      try {
        const updated = await this.api('PUT', `/tasks/${id}`, { current_stage_id: stageId });
        this.tasks = replaceTaskInTree(this.tasks, updated);
      } catch (err) {
        // Revert on error
        const currentTarget = findTaskInTree(this.tasks, id);
        if (currentTarget) {
          this.tasks = replaceTaskInTree(this.tasks, { ...currentTarget, current_stage_id: previousStageId });
        }
        this.showToast('Failed to update stage. Reverted change.', 'error');
      }
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

function getDropPosition(list, toIndex) {
  let newPos;
  if (list.length === 1) {
    newPos = 2000;
  } else if (toIndex === 0) {
    newPos = list[1].position - 2000;
  } else if (toIndex === list.length - 1) {
    newPos = list[toIndex - 1].position + 2000;
  } else {
    const prevPos = list[toIndex - 1].position;
    const nextPos = list[toIndex + 1].position;
    newPos = Math.floor((prevPos + nextPos) / 2);
  }

  let needsReindex = false;
  if (toIndex > 0 && newPos <= list[toIndex - 1].position) {
    needsReindex = true;
  }
  if (toIndex < list.length - 1 && newPos >= list[toIndex + 1].position) {
    needsReindex = true;
  }

  return { newPos, needsReindex };
}

function applyReindex(list, spacing = 2000) {
  list.forEach((item, idx) => {
    item.position = (idx + 1) * spacing;
  });
}

function findTaskInTree(list, id) {
  for (const t of list) {
    if (t.id === id) return t;
    if (t.subtasks && t.subtasks.length) {
      const found = findTaskInTree(t.subtasks, id);
      if (found) return found;
    }
  }
  return null;
}
