import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: { email: true },
  // Grupa administratorów: członków dodajesz ręcznie w konsoli Cognito (User pools > Groups > admin)
  groups: ['admin'],
});
