export const getPublicClient = (_?: any) => ({
  waitForTransactionReceipt: async (_opts: any) => ({ status: "success" }),
});

