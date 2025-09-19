type StorybookMockHandler<TParams, TResult> = (params: TParams) => TResult;

const getGlobalMocks = (): Record<string, unknown> | undefined => {
  if (typeof window === "undefined") return undefined;
  const target = window as unknown as { __STORYBOOK_MOCKS?: Record<string, unknown> };
  return target.__STORYBOOK_MOCKS;
};

export const getStorybookMock = <TParams, TResult>(
  key: string,
): StorybookMockHandler<TParams, TResult> | undefined => {
  const mocks = getGlobalMocks();
  const handler = mocks?.[key];
  return typeof handler === "function"
    ? (handler as StorybookMockHandler<TParams, TResult>)
    : undefined;
};

export const invokeStorybookMock = <TParams, TResult>(
  key: string,
  handler: StorybookMockHandler<TParams, TResult> | undefined,
  params: TParams,
): TResult | undefined => {
  if (!handler) return undefined;
  try {
    return handler(params);
  } catch (error) {
    console.warn(`Storybook mock for ${key} threw`, error);
    return undefined;
  }
};
