import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface GLReconciliationInclusion {
  accountingSequenceNumber: string;
  note: string | null;
  createdBy: string;
  createdOnUtc: string;
}

const QUERY_KEY = ["admin", "gl-reconciliation-inclusions"] as const;

export const useGLInclusionsQuery = () =>
  useQuery<GLReconciliationInclusion[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/gl-reconciliation-inclusions");
      if (!res.ok) throw new Error("Failed to fetch GL reconciliation inclusions");
      return res.json();
    },
  });

export const useAddGLInclusion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { accountingSequenceNumber: string; note?: string }) => {
      const res = await fetch("/api/admin/gl-reconciliation-inclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.status === 409) throw new Error("ASN already exists");
      if (!res.ok) throw new Error("Failed to add inclusion");
      return res.json() as Promise<GLReconciliationInclusion>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

export const useRemoveGLInclusion = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (asn: string) => {
      const res = await fetch(
        `/api/admin/gl-reconciliation-inclusions/${encodeURIComponent(asn)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove inclusion");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      mutation.reset();
    },
  });
  return mutation;
};
