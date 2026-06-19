"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SearchCtx {
  search: string;
  setSearch: (v: string) => void;
}

const SearchContext = createContext<SearchCtx>({ search: "", setSearch: () => {} });

export function SearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  return <SearchContext.Provider value={{ search, setSearch }}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  return useContext(SearchContext);
}
