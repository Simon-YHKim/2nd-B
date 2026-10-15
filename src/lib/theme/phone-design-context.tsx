import { createContext, createElement, useContext, type ReactNode } from "react";

// Deliberately React-only: shared text and controls must not import navigation.
// The dashboard opts its display subtree in; standalone routes stay untouched.
const PhoneDesignContext = createContext(false);
const PhoneForegroundContext = createContext<string | undefined>(undefined);

export function PhoneDesignProvider({ enabled = true, children }: { enabled?: boolean; children?: ReactNode }) {
  return createElement(PhoneDesignContext.Provider, { value: enabled }, children);
}

export function usePhoneDesign(): boolean {
  return useContext(PhoneDesignContext);
}

export function PhoneForegroundProvider({ color, children }: { color?: string; children?: ReactNode }) {
  const inherited = useContext(PhoneForegroundContext);
  return createElement(PhoneForegroundContext.Provider, { value: color ?? inherited }, children);
}

export function usePhoneForeground(): string | undefined {
  return useContext(PhoneForegroundContext);
}
