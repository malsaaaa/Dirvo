/**
 * The only commands Dirvo will ever show or copy as cleanup advice. Each one is a tool cleaning up
 * its OWN cache, so no generic delete command (rm, del, Remove-Item, ...) can appear here.
 *
 * Dirvo never runs these. It can only put one on the clipboard for you to paste into a terminal.
 * Adding a command needs a code change on purpose: the known-folder database is validated against
 * this list, so a typo or a bad entry in the data file cannot smuggle in something dangerous.
 */
export const ALLOWED_CLEAN_COMMANDS: readonly string[] = [
  'npm cache clean --force',
  'yarn cache clean',
  'pnpm store prune',
  'pip cache purge',
  'dotnet nuget locals all --clear',
  'go clean -cache',
  'go clean -modcache',
  'conda clean --all',
  'docker system prune',
  'huggingface-cli delete-cache',
  'ollama list',
  'DISM /Online /Cleanup-Image /StartComponentCleanup'
]

export function isAllowedCleanCommand(command: unknown): command is string {
  return typeof command === 'string' && ALLOWED_CLEAN_COMMANDS.includes(command)
}

/** Windows Settings pages Dirvo can open. Anything else is refused. */
export const SETTINGS_URIS = {
  storage: 'ms-settings:storagesense',
  apps: 'ms-settings:appsfeatures'
} as const

export type SettingsTargetKey = keyof typeof SETTINGS_URIS

export function isSettingsTarget(target: unknown): target is SettingsTargetKey {
  return typeof target === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_URIS, target)
}
