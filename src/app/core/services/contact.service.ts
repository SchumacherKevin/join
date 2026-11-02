import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Contact, NewContact } from '../models/contact.model';

/** Manages CRUD operations for contacts with a stale-while-revalidate in-memory cache. */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private api = inject(ApiService);

  private contactsCache: Contact[] | null = null;

  /**
   * Returns cached contacts immediately (revalidating in the background), or fetches fresh.
   *
   * @param onRevalidate Called with fresh data if a background revalidation finds changes.
   * @param forceRefresh Skips the cache and fetches fresh data synchronously.
   */
  async getContacts(
    onRevalidate?: (contacts: Contact[]) => void,
    forceRefresh = false,
  ): Promise<Contact[]> {
    if (this.contactsCache && !forceRefresh) {
      if (onRevalidate) {
        this.revalidateContacts(onRevalidate);
      }
      return this.contactsCache;
    }
    const data = await this.api.get<Contact[]>('contacts');
    this.contactsCache = this.sortContacts(data);
    return this.contactsCache;
  }

  /** Creates a contact and keeps the in-memory cache in sync. */
  async addContact(contact: NewContact): Promise<Contact> {
    const newContact = await this.api.post<Contact>('contacts', contact);
    if (this.contactsCache) {
      this.contactsCache.push(newContact);
      this.contactsCache = this.sortContacts(this.contactsCache);
    }
    return newContact;
  }

  /** Updates a contact and keeps the in-memory cache in sync. */
  async updateContact(id: string, changes: Partial<NewContact>): Promise<Contact> {
    const updatedContact = await this.api.patch<Contact>(`contacts/${id}`, changes);
    if (this.contactsCache) {
      const idx = this.contactsCache.findIndex((c) => c.id === id);
      if (idx > -1) {
        this.contactsCache[idx] = updatedContact;
        this.contactsCache = this.sortContacts(this.contactsCache);
      }
    }
    return updatedContact;
  }

  /** Deletes a contact and keeps the in-memory cache in sync. */
  async deleteContact(id: string): Promise<void> {
    await this.api.delete(`contacts/${id}`);

    if (this.contactsCache) {
      this.contactsCache = this.contactsCache.filter((c) => c.id !== id);
    }
  }

  /** Drops the in-memory contacts cache, forcing the next read to hit the database. */
  clearCache() {
    this.contactsCache = null;
  }

  /** Sorts contacts alphabetically by full name. */
  private sortContacts(contacts: Contact[]): Contact[] {
    return contacts.sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim();
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim();
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Fetches fresh contacts in the background and, if they differ from the cache, updates
   * the cache and notifies the caller.
   */
  private async revalidateContacts(onRevalidate: (contacts: Contact[]) => void): Promise<void> {
    try {
      const data = await this.api.get<Contact[]>('contacts');
      const freshContacts = this.sortContacts(data);

      const hasChanged = JSON.stringify(this.contactsCache) !== JSON.stringify(freshContacts);
      if (hasChanged) {
        this.contactsCache = freshContacts;
        onRevalidate(this.contactsCache);
      }
    } catch (e) {
      console.error('Error revalidating contacts:', e);
    }
  }
}
