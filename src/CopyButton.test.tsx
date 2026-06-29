import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with the default copy label", () => {
    render(<CopyButton text="hello" />);
    expect(
      screen.getByRole("button", { name: "Copy code" }),
    ).toBeInTheDocument();
  });

  it("applies the provided className", () => {
    render(<CopyButton text="hello" className="my-button" />);
    expect(screen.getByRole("button")).toHaveClass("my-button");
  });

  it("writes the text to the clipboard on click", async () => {
    render(<CopyButton text="copy me" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("copy me");
    // Flush the resolved clipboard write so the resulting state update
    // happens inside act(...).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("switches to the copied state after the write resolves", async () => {
    render(<CopyButton text="copy me" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).toHaveAccessibleName("Copied");
    });
    expect(button).toHaveAttribute("data-copied", "");
  });

  it("stays in the idle state when the clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyButton text="copy me" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button).toHaveAccessibleName("Copy code");
  });

  it("resets back to the copy state after the timeout", async () => {
    vi.useFakeTimers();
    render(<CopyButton text="copy me" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    // Flush the resolved clipboard write so the copied state + timeout are set.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button).toHaveAccessibleName("Copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(button).toHaveAccessibleName("Copy code");
  });
});
