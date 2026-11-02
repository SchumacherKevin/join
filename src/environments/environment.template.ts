// Create two new files called:
// environment.development.ts and
// environment.ts
// in the src/environments directory.
// This file will serve as a template for the environment configuration.
// apiUrl is the base URL of the Django REST API (see the join-backend project),
// e.g. 'http://localhost:8000/api' for development.
export const environment = {
  production: false,
  apiUrl: '',
};
