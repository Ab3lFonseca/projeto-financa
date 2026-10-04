import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Cache de consultas: dados recentes ficam disponíveis offline (persistidos no aparelho) e
 * as telas revalidam em segundo plano. Erros 4xx não são repetidos; falhas de rede/servidor sim.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
    },
  },
});

export const CACHE_KEY = "rq-cache-v1";
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY, throttleTime: 1500 });
export const PERSIST_MAX_AGE = DAY;

/** Apaga tudo que foi guardado no aparelho (logout, exclusão de conta). */
export async function clearLocalCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
