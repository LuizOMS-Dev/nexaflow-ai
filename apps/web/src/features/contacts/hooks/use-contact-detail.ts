"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchContact } from "../api";

export function useContactDetail(id: string | null) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => fetchContact(id!),
    enabled: Boolean(id),
  });
}
