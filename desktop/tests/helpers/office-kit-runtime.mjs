import path from 'node:path';

const configuredDirectory = process.env.WB_TEST_OFFICE_DIRECTORY;
const configuredSoffice = process.env.WB_TEST_SOFFICE;
const linuxProgram = '/opt/codex/runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/program';

export const officeDirectory = configuredDirectory ||
  (process.platform === 'darwin' && configuredSoffice ? path.dirname(configuredSoffice) : linuxProgram);
export const officeSoffice = configuredDirectory
  ? path.join(officeDirectory, process.platform === 'win32' ? 'soffice.exe' : 'soffice')
  : configuredSoffice || (process.platform === 'linux'
    ? '/opt/codex/runtimes/codex-primary-runtime/dependencies/bin/override/soffice'
    : path.join(officeDirectory, process.platform === 'win32' ? 'soffice.exe' : 'soffice'));
export const officePython = process.env.WB_TEST_PYTHON || 'python3';
