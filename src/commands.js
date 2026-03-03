/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

const userOption = { name: 'user', description: 'User to allow or block', type: 6, required: true };

export const APPROVE_COMMAND = {
  name: 'approve',
  description: 'Allow a user to use this bot (owner only)',
  options: [userOption],
};

export const BLOCK_COMMAND = {
  name: 'block',
  description: 'Block a user from using this bot (owner only)',
  options: [userOption],
};

export const WELCOME_COMMAND = {
  name: '환영',
  description: 'Send a custom welcome message to a specific channel (owner only)',
  options: [
    { name: 'target_user', description: 'User to welcome', type: 6, required: true },
    { name: 'channel', description: 'Channel to send the message to', type: 7, required: true },
    { name: 'message', description: 'Custom message (e.g. welcome text). Use empty or leave default for simple mention.', type: 3, required: false },
  ],
};
