import { createContext, useContext, type Context, type Provider } from "react";

/**
 * Creates a context with a safe hook that throws an error if used outside of its provider.
 * This reduces boilerplate when creating context + hook pairs.
 *
 * @param contextName - Name of the context for error messages
 * @returns An object with the Context, Provider type, and useContext hook
 *
 * @example
 * // Create context
 * const { Context, useContextValue } = createSafeContext<MyContextType>("MyContext");
 *
 * // Use in provider
 * export const MyProvider = ({ children }) => {
 *   const [state, setState] = useState(initialState);
 *   return (
 *     <Context.Provider value={{ state, setState }}>
 *       {children}
 *     </Context.Provider>
 *   );
 * };
 *
 * // Export hook (renamed appropriately)
 * export const useMyContext = useContextValue;
 */
export function createSafeContext<T>(contextName: string) {
  const Context = createContext<T | null>(null);
  Context.displayName = contextName;

  function useContextValue(): T {
    const context = useContext(Context);
    if (context === null) {
      throw new Error(
        `use${contextName} must be used within a ${contextName}Provider`
      );
    }
    return context;
  }

  return {
    Context: Context as Context<T | null>,
    Provider: Context.Provider as Provider<T | null>,
    useContextValue,
  };
}
