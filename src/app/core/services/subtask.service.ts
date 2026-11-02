import { Injectable, EventEmitter, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Subtask, NewSubtask } from '../models/subtask.model';

/** Manages CRUD operations for subtasks and notifies listeners when a task's subtasks change. */
@Injectable({ providedIn: 'root' })
export class SubtaskService {
  private api = inject(ApiService);

  /** Emits the parent task id whenever a subtask is added, updated, or deleted. */
  subtasksChanged = new EventEmitter<string>();

  /** Fetches all subtasks for a task, ordered by creation time. */
  async getSubtasks(taskId: string): Promise<Subtask[]> {
    return this.api.get<Subtask[]>('subtasks', { task_id: taskId });
  }

  /** Creates a subtask and notifies listeners of the change. */
  async addSubtask(subtask: NewSubtask): Promise<Subtask> {
    const created = await this.api.post<Subtask>('subtasks', subtask);
    this.subtasksChanged.emit(created.task_id);
    return created;
  }

  /** Updates a subtask and notifies listeners of the change. */
  async updateSubtask(id: string, changes: Partial<NewSubtask>): Promise<Subtask> {
    const updated = await this.api.patch<Subtask>(`subtasks/${id}`, changes);
    this.subtasksChanged.emit(updated.task_id);
    return updated;
  }

  /** Deletes a subtask and, if the parent task id is known, notifies listeners of the change. */
  async deleteSubtask(id: string, taskId?: string): Promise<void> {
    await this.api.delete(`subtasks/${id}`);
    if (taskId) {
      this.subtasksChanged.emit(taskId);
    }
  }
}
