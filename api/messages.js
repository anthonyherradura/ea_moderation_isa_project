// User-facing strings, kept out of the route code.
export const MSG = {
  invalidInput: 'Invalid input.',
  emailTaken: 'That email is already registered.',
  badLogin: 'Wrong email or password.',
  notLoggedIn: 'Please log in.',
  forbidden: 'You do not have permission to do that.',
  notFound: 'Not found.',
  loggedOut: 'Logged out.',
  nothingToUpdate: 'Send a decision (moderators) or an appealNote (case owner).',
  alreadyDecided: 'This case has already been overturned.',
  deleted: 'Case deleted.',
  tooManyRequests: 'Too many requests. Try again in a minute.',
  serverError: 'Something went wrong.',
  overFreeLimit: (limit) => `You have used all ${limit} free API calls.`,
  inferenceDown: 'The AI model is unavailable, so this was sent to a human moderator.',
};
