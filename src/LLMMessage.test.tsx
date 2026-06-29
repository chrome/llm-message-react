import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LLMMessage } from "./LLMMessage";

describe("LLMMessage", () => {
  describe("content sources", () => {
    it("renders the children string as markdown", () => {
      render(<LLMMessage>Hello **world**</LLMMessage>);
      expect(screen.getByText("world").tagName).toBe("STRONG");
    });

    it("renders the content prop", () => {
      render(<LLMMessage content="Just text" />);
      expect(screen.getByText("Just text")).toBeInTheDocument();
    });

    it("prefers content over children when both are given", () => {
      render(<LLMMessage content="from content">from children</LLMMessage>);
      expect(screen.getByText("from content")).toBeInTheDocument();
      expect(screen.queryByText("from children")).not.toBeInTheDocument();
    });

    it("renders nothing meaningful for empty input", () => {
      const { container } = render(<LLMMessage />);
      expect(container.querySelector(".llm-message")).toBeEmptyDOMElement();
    });
  });

  describe("root element", () => {
    it("applies the built-in root class and custom className", () => {
      const { container } = render(
        <LLMMessage className="custom-root">hi</LLMMessage>,
      );
      const root = container.querySelector(".llm-message");
      expect(root).toHaveClass("llm-message", "custom-root");
    });

    it("forwards rest props to the root element", () => {
      render(<LLMMessage data-testid="msg">hi</LLMMessage>);
      expect(screen.getByTestId("msg")).toBeInTheDocument();
    });

    it("applies the root classNames override", () => {
      const { container } = render(
        <LLMMessage classNames={{ root: "themed" }}>hi</LLMMessage>,
      );
      expect(container.querySelector(".llm-message")).toHaveClass("themed");
    });
  });

  describe("markdown elements", () => {
    it("renders headings", () => {
      render(<LLMMessage># Title</LLMMessage>);
      const heading = screen.getByRole("heading", { level: 1, name: "Title" });
      expect(heading).toHaveClass("llm-h1");
    });

    it("renders links with safe target and rel", () => {
      render(<LLMMessage>[link](https://example.com)</LLMMessage>);
      const link = screen.getByRole("link", { name: "link" });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("wraps tables in a scroll container", () => {
      const { container } = render(
        <LLMMessage>{"| a | b |\n| - | - |\n| 1 | 2 |"}</LLMMessage>,
      );
      expect(container.querySelector(".llm-table-wrapper")).toBeInTheDocument();
      expect(container.querySelector("table.llm-table")).toBeInTheDocument();
    });

    it("renders task list checkboxes as read-only", () => {
      render(<LLMMessage>{"- [x] done\n- [ ] todo"}</LLMMessage>);
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[0]).toHaveAttribute("readonly");
      expect(checkboxes[1]).not.toBeChecked();
    });

    it("renders inline code", () => {
      render(<LLMMessage>Use `npm install` now</LLMMessage>);
      const code = screen.getByText("npm install");
      expect(code.tagName).toBe("CODE");
      expect(code).toHaveClass("llm-code");
    });

    it("renders h4-h6 headings with their classes", () => {
      render(<LLMMessage>{"#### Four\n\n##### Five\n\n###### Six"}</LLMMessage>);
      expect(screen.getByRole("heading", { level: 4, name: "Four" })).toHaveClass(
        "llm-h4",
      );
      expect(screen.getByRole("heading", { level: 5, name: "Five" })).toHaveClass(
        "llm-h5",
      );
      expect(screen.getByRole("heading", { level: 6, name: "Six" })).toHaveClass(
        "llm-h6",
      );
    });

    it("renders emphasis with the llm-em class", () => {
      render(<LLMMessage>some *emph* text</LLMMessage>);
      const em = screen.getByText("emph");
      expect(em.tagName).toBe("EM");
      expect(em).toHaveClass("llm-em");
    });

    it("renders strikethrough with the llm-del class", () => {
      render(<LLMMessage>{"a ~~gone~~ b"}</LLMMessage>);
      const del = screen.getByText("gone");
      expect(del.tagName).toBe("DEL");
      expect(del).toHaveClass("llm-del");
    });

    it("renders images with the llm-img class and alt text", () => {
      const { container } = render(
        <LLMMessage>{"![a cat](https://example.com/cat.png)"}</LLMMessage>,
      );
      const img = container.querySelector("img");
      expect(img).toHaveClass("llm-img");
      expect(img).toHaveAttribute("src", "https://example.com/cat.png");
      expect(img).toHaveAttribute("alt", "a cat");
    });
  });

  describe("fenced code blocks", () => {
    it("renders a code block with language label, copy button, and plain body by default", () => {
      const { container } = render(
        <LLMMessage>{"```js\nconst a = 1;\n```"}</LLMMessage>,
      );
      expect(screen.getByText("js")).toHaveClass("llm-code-language");
      expect(
        screen.getByRole("button", { name: "Copy code" }),
      ).toBeInTheDocument();
      const body = container.querySelector(".llm-code-plain");
      expect(body).toBeInTheDocument();
      expect(body).toHaveTextContent("const a = 1;");
    });

    it("renders a fence without a language as a block, not inline code", () => {
      const { container } = render(
        <LLMMessage>{"```\nplain block\n```"}</LLMMessage>,
      );
      expect(container.querySelector(".llm-code-block")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Copy code" }),
      ).toBeInTheDocument();
      expect(container.querySelector(".llm-code-plain")).toHaveTextContent(
        "plain block",
      );
    });

    it("passes code and language to a provided highlighter", () => {
      const Highlighter = ({
        code,
        language,
      }: {
        code: string;
        language: string;
      }) => (
        <code data-testid="highlighted" data-language={language}>
          {code}
        </code>
      );
      render(
        <LLMMessage highlighter={Highlighter}>
          {"```ts\nconst b = 2;\n```"}
        </LLMMessage>,
      );
      const highlighted = screen.getByTestId("highlighted");
      expect(highlighted).toHaveAttribute("data-language", "ts");
      expect(highlighted).toHaveTextContent("const b = 2;");
    });
  });

  describe("math", () => {
    it("renders inline math via KaTeX", () => {
      const { container } = render(<LLMMessage>{"value \\(x^2\\)"}</LLMMessage>);
      expect(container.querySelector(".katex")).toBeInTheDocument();
    });

    it("renders a complete \\[ aligned block without errors", () => {
      const { container } = render(
        <LLMMessage>
          {"\\[\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n\\]"}
        </LLMMessage>,
      );
      expect(container.querySelector(".katex-display")).toBeInTheDocument();
      expect(container.querySelector(".katex-error")).not.toBeInTheDocument();
    });

    it("progressively renders an unterminated \\[ aligned block without errors", () => {
      const streamed =
        "ChatGPT-style block math:\n\\[\n\\begin{aligned}\n\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\\n\\nabla \\cdot \\vec{B} &= 0 \\\\";
      const { container } = render(<LLMMessage>{streamed}</LLMMessage>);
      expect(container.querySelector(".katex-display")).toBeInTheDocument();
      expect(container.querySelector(".katex-error")).not.toBeInTheDocument();
    });

    it("progressively renders an unterminated $$ aligned block without errors", () => {
      const streamed =
        "$$\n\\begin{aligned}\na &= b \\\\\nc &= d \\\\";
      const { container } = render(<LLMMessage>{streamed}</LLMMessage>);
      expect(container.querySelector(".katex-display")).toBeInTheDocument();
      expect(container.querySelector(".katex-error")).not.toBeInTheDocument();
    });

    it("hides an unfinished block when showUnfinishedLatexBlocks is false", () => {
      const { container } = render(
        <LLMMessage showUnfinishedLatexBlocks={false}>
          {"before \\[a + b"}
        </LLMMessage>,
      );
      expect(container.querySelector(".katex")).not.toBeInTheDocument();
      expect(container).toHaveTextContent("before");
    });
  });

  describe("partial token repair", () => {
    it("repairs unterminated emphasis by default", () => {
      render(<LLMMessage>{"streaming **bold"}</LLMMessage>);
      expect(screen.getByText("bold").tagName).toBe("STRONG");
    });

    it("does not repair when disabled", () => {
      render(
        <LLMMessage completePartialTokens={false}>
          {"streaming **bold"}
        </LLMMessage>,
      );
      expect(screen.queryByText("bold")).not.toBeInTheDocument();
      expect(screen.getByText(/streaming \*\*bold/)).toBeInTheDocument();
    });
  });

  describe("overrides", () => {
    it("uses a custom paragraph component", () => {
      const P = ({ children }: { children?: React.ReactNode }) => (
        <p data-testid="custom-p">{children}</p>
      );
      render(<LLMMessage components={{ p: P }}>some text</LLMMessage>);
      expect(screen.getByTestId("custom-p")).toHaveTextContent("some text");
    });

    it("uses a custom code block component", () => {
      const CodeBlock = ({
        code,
        language,
      }: {
        code: string;
        language: string;
      }) => (
        <div data-testid="custom-block" data-language={language}>
          {code}
        </div>
      );
      render(
        <LLMMessage components={{ codeBlock: CodeBlock }}>
          {"```py\nprint(1)\n```"}
        </LLMMessage>,
      );
      const block = screen.getByTestId("custom-block");
      expect(block).toHaveAttribute("data-language", "py");
      expect(block).toHaveTextContent("print(1)");
    });

    it("uses a custom image component", () => {
      const Img = ({ src, alt }: { src?: string; alt?: string }) => (
        <img data-testid="custom-img" src={src} alt={alt} />
      );
      render(
        <LLMMessage components={{ img: Img }}>
          {"![logo](https://example.com/logo.svg)"}
        </LLMMessage>,
      );
      const img = screen.getByTestId("custom-img");
      expect(img).toHaveAttribute("src", "https://example.com/logo.svg");
      expect(img).toHaveAttribute("alt", "logo");
    });

    it("merges per-element classNames", () => {
      render(
        <LLMMessage classNames={{ p: "my-p" }}>text</LLMMessage>,
      );
      const paragraph = screen.getByText("text");
      expect(paragraph).toHaveClass("llm-p", "my-p");
    });
  });
});
