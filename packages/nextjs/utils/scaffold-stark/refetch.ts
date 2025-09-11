import { queryClient } from "~~/services/reactQuery";

const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 300) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
};

export const refetchPending = debounce(async (tags: string[]) => {
  await Promise.all(
    tags.map(tag =>
      queryClient.refetchQueries({
        queryKey: [tag],
        exact: false,
        predicate: query => (query.meta as any)?.blockId === "pending",
      }),
    ),
  );
});

export const refetchFinal = debounce(async (tags: string[]) => {
  await Promise.all(tags.map(tag => queryClient.invalidateQueries({ queryKey: [tag], exact: false })));
});

