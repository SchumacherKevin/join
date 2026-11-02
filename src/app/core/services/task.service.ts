import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Task, NewTask, TaskStatus } from '../models/task.model';
import { Contact } from '../models/contact.model';

/** Manages CRUD operations for tasks with a stale-while-revalidate in-memory cache. */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private api = inject(ApiService);

  private tasksCache: Task[] | null = null;

  /**
   * Returns cached tasks immediately (revalidating in the background), or fetches fresh.
   *
   * @param onRevalidate Called with fresh data if a background revalidation finds changes.
   * @param forceRefresh Skips the cache and fetches fresh data synchronously.
   */
  async getTasks(onRevalidate?: (tasks: Task[]) => void, forceRefresh = false): Promise<Task[]> {
    if (this.tasksCache && !forceRefresh) {
      if (onRevalidate) {
        this.revalidateTasks(onRevalidate);
      }
      return this.tasksCache;
    }
    const data = await this.api.get<Task[]>('tasks');
    this.tasksCache = this.sortTasks(data);
    return this.tasksCache;
  }

  /** Fetches a single task by id, preferring the in-memory cache when available. */
  async getTask(id: string): Promise<Task> {
    if (this.tasksCache) {
      const cached = this.tasksCache.find((t) => t.id === id);
      if (cached) return cached;
    }
    return this.api.get<Task>(`tasks/${id}`);
  }

  /** Creates a task, defaulting its status/position, and keeps the in-memory cache in sync. */
  async addTask(task: NewTask, assignedContactIds: string[] = []): Promise<Task> {
    const payload = this.buildNewTaskPayload(task, assignedContactIds);
    const newTask = await this.api.post<Task>('tasks', payload);
    this.cacheNewTask(newTask);
    return newTask;
  }

  /** Builds the insert payload for a new task, filling in status, position, and assignees. */
  private buildNewTaskPayload(task: NewTask, assignedContactIds: string[]) {
    const status = task.status ?? 'todo';
    return {
      ...task,
      status,
      position: task.position ?? this.getNextPosition(status),
      contact_ids: assignedContactIds.length ? assignedContactIds : null,
    };
  }

  /** Adds a newly created task to the in-memory cache, re-sorting it. */
  private cacheNewTask(newTask: Task): void {
    if (this.tasksCache) {
      this.tasksCache.push(newTask);
      this.tasksCache = this.sortTasks(this.tasksCache);
    }
  }

  /** Persists the order and column of tasks after a drag-and-drop reorder on the board. */
  async updateTaskPositions(
    updates: { id: string; status: TaskStatus; position: number }[],
  ): Promise<void> {
    await this.persistTaskPositions(updates);
    this.updateCachedPositions(updates);
  }

  /** Writes the new status/position of all moved tasks to the database in one request. */
  private async persistTaskPositions(
    updates: { id: string; status: TaskStatus; position: number }[],
  ): Promise<void> {
    if (!updates.length) return;
    await this.api.post('tasks/positions', updates);
  }

  /** Applies the new status/position to the in-memory task cache, if present. */
  private updateCachedPositions(
    updates: { id: string; status: TaskStatus; position: number }[],
  ): void {
    if (!this.tasksCache) return;
    for (const update of updates) {
      const cached = this.tasksCache.find((t) => t.id === update.id);
      if (cached) {
        cached.status = update.status;
        cached.position = update.position;
      }
    }
    this.tasksCache = this.sortTasks(this.tasksCache);
  }

  /** Computes the next board position for a task added to the given column. */
  private getNextPosition(status: TaskStatus): number {
    const tasksInStatus = (this.tasksCache ?? []).filter((t) => t.status === status);
    if (!tasksInStatus.length) return 0;
    return Math.max(...tasksInStatus.map((t) => t.position ?? 0)) + 1;
  }

  /** Updates a task and keeps the in-memory cache in sync. */
  async updateTask(id: string, changes: Partial<NewTask>): Promise<Task> {
    const updatedTask = await this.api.patch<Task>(`tasks/${id}`, changes);
    if (this.tasksCache) {
      const idx = this.tasksCache.findIndex((t) => t.id === id);
      if (idx > -1) {
        this.tasksCache[idx] = updatedTask;
        this.tasksCache = this.sortTasks(this.tasksCache);
      }
    }
    return updatedTask;
  }

  /** Deletes a task and keeps the in-memory cache in sync. */
  async deleteTask(id: string): Promise<void> {
    await this.api.delete(`tasks/${id}`);

    if (this.tasksCache) {
      this.tasksCache = this.tasksCache.filter((t) => t.id !== id);
    }
  }

  /** Drops the in-memory tasks cache, forcing the next read to hit the database. */
  clearCache() {
    this.tasksCache = null;
  }

  /** Sorts tasks by board position, then by due date (undated tasks last). */
  private sortTasks(tasks: Task[]): Task[] {
    return tasks.sort((a, b) => {
      const posA = a.position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.position ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }

  /**
   * Fetches fresh tasks in the background and, if they differ from the cache, updates
   * the cache and notifies the caller.
   */
  private async revalidateTasks(onRevalidate: (tasks: Task[]) => void): Promise<void> {
    try {
      const data = await this.api.get<Task[]>('tasks');
      const freshTasks = this.sortTasks(data);

      const hasChanged = JSON.stringify(this.tasksCache) !== JSON.stringify(freshTasks);
      if (hasChanged) {
        this.tasksCache = freshTasks;
        onRevalidate(this.tasksCache);
      }
    } catch (e) {
      console.error('Error revalidating tasks:', e);
    }
  }

  /** Fetches the contacts assigned to a task. */
  async getAssignedContacts(taskId: string): Promise<Contact[]> {
    const task = await this.getTask(taskId);
    if (!task || !task.contact_ids || !task.contact_ids.length) return [];

    return this.api.get<Contact[]>('contacts', { ids: task.contact_ids.join(',') });
  }

  /** Replaces the set of contacts assigned to a task and keeps the in-memory cache in sync. */
  async setAssignedContacts(taskId: string, contactIds: string[]): Promise<void> {
    await this.api.patch(`tasks/${taskId}`, {
      contact_ids: contactIds.length ? contactIds : null,
    });

    if (this.tasksCache) {
      const idx = this.tasksCache.findIndex((t) => t.id === taskId);
      if (idx > -1) {
        this.tasksCache[idx].contact_ids = contactIds.length ? contactIds : null;
      }
    }
  }
}
