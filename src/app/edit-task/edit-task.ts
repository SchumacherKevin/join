import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task, Priority } from '../core/models/task.model';
import { Subtask } from '../core/models/subtask.model';
import { Contact } from '../core/models/contact.model';
import { TaskService } from '../core/services/task.service';
import { SubtaskService } from '../core/services/subtask.service';
import { ContactService } from '../core/services/contact.service';
import { Avatar } from '../shared/avatar/avatar';
import { SubtaskList, SubtaskListItem } from '../shared/subtask-list/subtask-list';
import { PrioritySelector } from '../shared/priority-selector/priority-selector';
import { ContactAssignDropdown } from '../shared/contact-assign-dropdown/contact-assign-dropdown';
import { getTodayIsoString, formatDueDate } from '../core/utils/date.utils';
import { getCategoryDisplayLabel, getPriorityDisplayLabel } from '../core/utils/task.utils';

/** Task detail dialog: view mode plus an in-place edit mode for the same task. */
@Component({
  selector: 'app-edit-task',
  imports: [FormsModule, Avatar, SubtaskList, PrioritySelector, ContactAssignDropdown],
  templateUrl: './edit-task.html',
  styleUrl: './edit-task.scss',
})
export class EditTask implements OnInit {
  private taskService = inject(TaskService);
  private subtaskService = inject(SubtaskService);
  private contactService = inject(ContactService);
  private changeDetectorRef = inject(ChangeDetectorRef);

  @Input({ required: true }) taskId!: string;

  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  task: Task | null = null;
  subtasks: Subtask[] = [];
  assignedContacts: Contact[] = [];
  allContacts: Contact[] = [];

  isEditMode = false;

  editTitle = '';
  editDescription = '';
  editDueDate = '';
  editPriority: Priority = 'medium';
  editContactIds: string[] = [];
  isAssignedDropdownOpen = false;

  ngOnInit() {
    this.loadTask();
  }

  /**
   * Loads the current task data with subtasks and assigned contacts from the backend.
   */
  async loadTask() {
    try {
      this.task = await this.taskService.getTask(this.taskId);
      this.subtasks = await this.subtaskService.getSubtasks(this.taskId);
      this.assignedContacts = await this.taskService.getAssignedContacts(this.task.id);
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error loading task:', e);
    }
  }

  /** Today's date, used as the due-date input's minimum in edit mode. */
  get todayIso(): string {
    return getTodayIsoString();
  }

  /** Human-readable label for the task's category. */
  get categoryLabel(): string {
    return getCategoryDisplayLabel(this.task?.category || null);
  }

  /** Human-readable label for the task's priority. */
  get priorityLabel(): string {
    if (!this.task) return '';
    return getPriorityDisplayLabel(this.task.priority);
  }

  /**
   * Returns the due date in the display format dd/mm/yyyy.
   */
  get formattedDueDate(): string {
    if (!this.task?.due_date) return 'No due date';
    return formatDueDate(this.task.due_date);
  }

  /** Closes the assigned-contacts dropdown if open, otherwise closes the whole dialog. */
  onClose() {
    if (this.isAssignedDropdownOpen) {
      this.isAssignedDropdownOpen = false;
      return;
    }
    this.close.emit();
  }

  /**
   * Toggles the done state of a subtask and saves it to the backend.
   */
  async toggleSubtask(subtask: Subtask) {
    try {
      const updated = await this.subtaskService.updateSubtask(subtask.id, { done: !subtask.done });
      this.subtasks = this.subtasks.map((s) => (s.id === updated.id ? updated : s));
      this.changed.emit();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error updating subtask:', e);
    }
  }

  /**
   * Deletes the task together with all of its subtasks.
   */
  async deleteTask() {
    if (!this.task) return;
    try {
      for (const subtask of this.subtasks) {
        await this.subtaskService.deleteSubtask(subtask.id);
      }
      await this.taskService.deleteTask(this.task.id);
      this.changed.emit();
      this.close.emit();
    } catch (e) {
      console.error('Error deleting task:', e);
    }
  }

  /**
   * Switches to edit mode and fills the form with the current task values.
   */
  startEdit() {
    if (!this.task) return;
    this.editTitle = this.task.title;
    this.editDescription = this.task.description ?? '';
    this.editDueDate = this.task.due_date ?? '';
    this.editPriority = this.task.priority;
    this.editContactIds = [...(this.task.contact_ids ?? [])];
    this.isEditMode = true;
    this.isAssignedDropdownOpen = false;
    this.loadAllContacts();
  }

  /** Fetches all contacts, needed to populate the assign-contacts dropdown in edit mode. */
  private async loadAllContacts() {
    try {
      this.allContacts = await this.contactService.getContacts();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error loading contacts:', e);
    }
  }

  /** Maps persisted subtasks to the shape the shared subtask editor expects. */
  get subtaskItems(): SubtaskListItem[] {
    return this.subtasks.map((s) => ({ id: s.id, title: s.title }));
  }

  /**
   * Adds a new subtask for this task in the backend.
   */
  async onAddSubtask(title: string) {
    if (!this.task) return;
    try {
      const subtask = await this.subtaskService.addSubtask({ task_id: this.task.id, title });
      this.subtasks = [...this.subtasks, subtask];
      this.changed.emit();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error adding subtask:', e);
    }
  }

  /**
   * Saves the edited title of a subtask to the backend.
   */
  async onUpdateSubtask(event: { id: string; title: string }) {
    try {
      const updated = await this.subtaskService.updateSubtask(event.id, { title: event.title });
      this.subtasks = this.subtasks.map((s) => (s.id === updated.id ? updated : s));
      this.changed.emit();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error updating subtask:', e);
    }
  }

  /**
   * Removes a subtask permanently from the backend.
   */
  async onRemoveSubtask(id: string) {
    try {
      await this.subtaskService.deleteSubtask(id);
      this.subtasks = this.subtasks.filter((s) => s.id !== id);
      this.changed.emit();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error deleting subtask:', e);
    }
  }

  /**
   * Saves the edited task values back to the backend and returns to the view mode.
   */
  async saveTask() {
    if (!this.task || !this.editTitle.trim()) return;
    try {
      this.task = await this.taskService.updateTask(this.task.id, {
        title: this.editTitle.trim(),
        description: this.editDescription.trim() || null,
        due_date: this.editDueDate || null,
        priority: this.editPriority,
        contact_ids: this.editContactIds,
      });
      this.assignedContacts = await this.taskService.getAssignedContacts(this.task.id);
      this.isEditMode = false;
      this.changed.emit();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.error('Error saving task:', e);
    }
  }
}
