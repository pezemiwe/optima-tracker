import { createContext, useContext } from 'react';

/* Lets any page open the global dialogs (new task, new project, help, palette). */
export const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);
