import { useState } from "react";
import type { JsonValue } from "../types/jsonParser";
import "./JsonTree.css";

type JsonTreeProps = {
  value: JsonValue;
};

type JsonTreeNodeProps = {
  nodeKey?: string;
  value: JsonValue;
  depth?: number;
  arrayIndex?: number;
};

function isContainer(value: JsonValue): value is JsonValue[] | Record<string, JsonValue> {
  return typeof value === "object" && value !== null;
}

function getContainerMeta(value: JsonValue[] | Record<string, JsonValue>) {
  if (Array.isArray(value)) {
    return {
      open: "[",
      close: "]",
      summary: `Array(${value.length})`,
      entries: value.map((entry, index) => ({
        label: undefined,
        arrayIndex: index,
        value: entry,
      })),
    };
  }

  const keys = Object.keys(value);

  return {
    open: "{",
    close: "}",
    summary: `Object(${keys.length})`,
    entries: keys.map((key) => ({
      label: key,
      arrayIndex: undefined,
      value: value[key],
    })),
  };
}

function formatPrimitive(value: JsonValue) {
  if (value === null) {
    return <span className="json-tree-value is-null">null</span>;
  }

  if (typeof value === "string") {
    return <span className="json-tree-value is-string">"{value}"</span>;
  }

  if (typeof value === "number") {
    return <span className="json-tree-value is-number">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="json-tree-value is-boolean">{String(value)}</span>;
  }

  return null;
}

function JsonTreeNode({
  nodeKey,
  value,
  depth = 0,
  arrayIndex,
}: JsonTreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!isContainer(value)) {
    return (
      <div className="json-tree-node" style={{ "--json-tree-depth": depth } as React.CSSProperties}>
        <div className="json-tree-row">
          <span className="json-tree-indent" aria-hidden="true" />
          <span className="json-tree-bullet" aria-hidden="true" />

          {typeof arrayIndex === "number" ? (
            <span className="json-tree-index">[{arrayIndex}]</span>
          ) : null}

          {nodeKey ? <span className="json-tree-key">"{nodeKey}"</span> : null}
          {nodeKey ? <span className="json-tree-colon">:</span> : null}
          {!nodeKey && typeof arrayIndex === "number" ? (
            <span className="json-tree-colon">:</span>
          ) : null}

          {formatPrimitive(value)}
        </div>
      </div>
    );
  }

  const meta = getContainerMeta(value);

  return (
    <div className="json-tree-node" style={{ "--json-tree-depth": depth } as React.CSSProperties}>
      <div className="json-tree-row">
        <span className="json-tree-indent" aria-hidden="true" />

        <button
          type="button"
          className="json-tree-toggle"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "展开节点" : "折叠节点"}
        >
          {collapsed ? "▸" : "▾"}
        </button>

        {typeof arrayIndex === "number" ? (
          <span className="json-tree-index">[{arrayIndex}]</span>
        ) : null}

        {nodeKey ? <span className="json-tree-key">"{nodeKey}"</span> : null}
        {nodeKey ? <span className="json-tree-colon">:</span> : null}
        {!nodeKey && typeof arrayIndex === "number" ? (
          <span className="json-tree-colon">:</span>
        ) : null}

        <span className="json-tree-bracket">{meta.open}</span>

        {collapsed ? (
          <>
            <span className="json-tree-summary">{meta.summary}</span>
            <span className="json-tree-bracket">{meta.close}</span>
          </>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="json-tree-children">
          {meta.entries.map((entry, index) => (
            <JsonTreeNode
              key={entry.label ?? `index-${entry.arrayIndex ?? index}`}
              nodeKey={entry.label}
              arrayIndex={entry.arrayIndex}
              value={entry.value}
              depth={depth + 1}
            />
          ))}

          <div className="json-tree-row json-tree-closing" style={{ "--json-tree-depth": depth } as React.CSSProperties}>
            <span className="json-tree-indent" aria-hidden="true" />
            <span className="json-tree-bullet" aria-hidden="true" />
            <span className="json-tree-bracket">{meta.close}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function JsonTree({ value }: JsonTreeProps) {
  return (
    <div className="json-tree" role="tree">
      <JsonTreeNode value={value} />
    </div>
  );
}