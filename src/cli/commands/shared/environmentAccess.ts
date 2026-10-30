export const noEnvironmentAccessMessage = (envId: string): string =>
  `You don't have access to environment "${envId}". Check you're signed in with the right account (run \`kontent login\` to switch), or ask an admin to grant you access.`;
