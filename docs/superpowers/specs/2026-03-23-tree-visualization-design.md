# Tree Visualization Design

Date: 2026-03-23

## Overview
React-компонент для визуализации hierarchical tree structures with dynamic updates, multiple connections between nodes, and perpendicular connection lines with rounded corners.

## Context
Two products need this component:
- **QADD**: Calculator app with React, Antd, Redux Toolkit
- **Adhocracy Plus**: Django platform with React frontend
- Both projects use React 18+

## Requirements
- Display tree structure with nodes and connections
- Dynamic add/remove nodes without page reload
- Multiple connections between nodes
- Connection lines: perpendicular segments with rounded corners (4px radius)
- Drag & drop nodes to reposition
- Node types: simple (text only) and rich (text, status, icon, description)
- Inline text editing (QADD) or modal editing (Adhocracy Plus)
- Keyboard navigation support
- Selection state visual feedback
- Performance: smooth for 20-100 nodes

- Accessible via keyboard and screen reader

## Architecture

### Component Structure
```
SimpleTree/
├── Tree.tsx           # Main container component
├── TreeNode.tsx       # Individual node component
├── Connection.tsx     # Connection line component
├── Controls.tsx        # Toolbar with action buttons
├── Modal.tsx            # Modal for rich node editing
├── index.tsx           # Exports
├── styles.module.css  # CSS module styles
```

### Hooks
```
useNodePositions.ts  # Position calculation and caching
```
### Utils
```
positions.ts          # Position calculation algorithms
```
### Types
```
index.ts             # TypeScript interfaces
```

## Data Model

### TreeNode
```typescript
interface TreeNode {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'simple' | 'rich';
  status?: string;      // For rich nodes
  icon?: string;        // For rich nodes
  description?: string; // For rich nodes
}
```

### Connection
```typescript
interface Connection {
  id: string;
  from: string;  // Source node id
  to: string;        // Target node id
}
```

### Component Props
```typescript
interface SimpleTreeProps {
  nodes: TreeNode[];
  connections: Connection[];
  onNodeClick?: (node: TreeNode) => void;
  onNodeDoubleClick?: (node: TreeNode) => void;
  onNodeDrag?: (node: TreeNode, x: number, y: number) => void;
  onAddNode?: (parentId?: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onUpdateNode?: (node: TreeNode) => void;
  onAddConnection?: (fromId: string, toId: string) => void;
  onDeleteConnection?: (connectionId: string) => void;
}
```

## Component Details

### Tree.tsx
Main container component handling:
- Node and connection rendering
- Position management
- Event handling
- Selection state
- Connection mode
- Drag & drop
- Modal state (for rich nodes)

- Keyboard navigation
- Screen reader announcements

### TreeNode.tsx
Individual node component supporting:
- Simple and rich node types
- Selection state
- Hover state
- Drag handling
- Inline editing (simple nodes)
- Modal trigger (rich nodes)

- Icon and status display

### Connection.tsx
SVG-based connection component featuring:
- Path calculation for perpendicular lines
- Rounded corners (4px radius)
- Hover state
- Selection state
- Click to delete

- Path highlighting on hover

### Controls.tsx
Action toolbar with buttons for:
- Add node
- Delete node
- Enter connection mode
- Delete connection
- Cancel actions

- Button states based on selection and mode

### Modal.tsx
Modal dialog for rich node editing:
- Title, description, status fields
- Save/Cancel actions
- Overlay handling
- Focus management

- Keyboard shortcuts

## Interaction Design

### Selection
- Click node: Select node, show selection highlight
- Ctrl+Click: Multi-select nodes (for bulk operations)
- Click connection: Select connection
- Click background: Deselect all

### Editing
- Double-click simple node: Enter inline edit mode
- Double-click rich node: Open modal editor
- Press Enter: Save inline edit
- Press Escape: Cancel inline edit

### Connection Mode
- Click "Connect" button in toolbar: Enter connection mode
- Click source node: Mark as connection start (highlighted)
- Click target node: Create connection
- Press Escape: Cancel connection mode
- Background click: Exit connection mode
- Visual feedback: Source node highlighted, cursor changes

### Delete Mode
- Select node/connection first
- Press Delete/Backspace: Delete selected item
- Click delete button in toolbar: Delete selected item
- Press Escape: Deselect

### Drag & Drop
- Mouse down on node: Start drag
- Mouse move: Update node position, connections redraw in real-time
- Mouse up: End drag, save position
- Rich nodes: Drag disabled (double-click opens modal)
- During drag: Node semi-transparent, connections animate

### Modal (Rich Nodes)
- Open: Double-click rich node
- Fields: Title, description, status, icon selector
- Save: Enter or Ctrl+Enter or click Save button
- Cancel: Escape or click Cancel/overlay
- Tab: Move between fields

### Keyboard Navigation
- Arrow keys: Navigate between nodes (up/down: parent/child, left/right: siblings)
- Home: Jump to first visible node
- End: Jump to last visible node
- Ctrl+Home: Jump to root node
- Tab: Move to next sibling
- Shift+Tab: Move to previous sibling
- Space: Toggle connection mode
- Ctrl+Arrow keys: Navigate between connections

## Edge Cases & Validation

### Empty Tree
- Show placeholder: "Add your first node" with Add button
- Center placeholder in container

### Validation Rules
- Self-connections: Prevented (node cannot connect to itself)
- Duplicate connections: Prevented (same from/to pair)
- Orphan nodes: Allowed (nodes without connections)
- Single node: Displayed normally

### Error Handling
- Invalid drag position: Clamp to container bounds
- Missing parent: Node becomes orphan (no error)
- Connection to deleted node: Connection removed automatically

### Performance
- 20 nodes: Full render, no optimization needed
- 100 nodes: All nodes rendered, connections cached
- 100+ nodes: Future - consider virtualization (react-window)

## Position Calculation Algorithm

### Layout Strategy: Top-Down Tree
```
1. Start at root (x: padding, y: padding)
2. For each level:
   a. Calculate total width needed for all nodes at this level
   b. Center children under parent
   c. Apply horizontal spacing between siblings
   d. Apply vertical spacing to next level
3. Recursively position all descendants
```

### Spacing Constants
- Vertical gap: 50px between levels
- Horizontal gap: 100px between siblings
- Container padding: 20px

### Algorithm (Pseudocode)
```typescript
function calculatePositions(root: TreeNode, nodes: Map<string, TreeNode>): void {
  const levelNodes = groupByLevel(nodes);
  let y = PADDING;
  
  for (const level of levelNodes) {
    const levelWidth = level.length * (NODE_WIDTH + H_GAP) - H_GAP;
    let x = (containerWidth - levelWidth) / 2;
    
    for (const node of level) {
      node.x = x;
      node.y = y;
      x += NODE_WIDTH + H_GAP;
    }
    y += NODE_HEIGHT + V_GAP;
  }
}
```

### Multiple Connections Between Same Nodes
- Each connection offset by 8px vertically
- Visual distinction: Different dash patterns optional
- Max 3 connections between same pair (practical limit)

## Visual Design
### Nodes
- **Simple nodes**: Bordered box with text, 120x50px
- **Rich nodes**: Box with header, status icon, description, 200x80px
- **Selected state**: Blue border (2px), light blue background
- **Hover state**: Gray background, light shadow

- **Dragging state**: Slightly transparent, shadow

### Connections
- **Default**: 2px solid gray line
- **Hover**: Blue highlight
- **Selected**: Blue, thicker line
- **Rounded corners**: 4px radius on perpendicular segments
- **Endpoints**: Small circles on node attachment points
### Layout
- **Structure**: Top-down tree layout
- **Root position**: Top-left of container
- **Child spacing**: Vertical gap of 50px
- **Sibling spacing**: Horizontal gap of 100px
- **Automatic positioning**: Algorithm calculates positions based on tree structure
- **Viewport adaptation**: Fits within container with scroll

### Colors
```css
:root {
  --node-bg: #ffffff;
  --node-border: #e0e0e0;
  --node-text: #333333;
  --node-selected: #1890ff;
  --connection-color: #666666;
  --connection-hover: #1890ff;
}
```

## Styling Approach

### CSS Modules
- BEM syntax for class names
- Scoped selectors prevent conflicts
- CSS variables for theming

### Accessibility
- High contrast mode support
- Visible focus indicators
- Screen reader announcements

### Dark Mode
```css
.dark-theme {
  --node-bg: #2d2d2d;
  --node-text: #e0e0e0;
  --node-border: #444444;
}
```

### Integration
- **QADD**: Import CSS module directly, use CSS variables
- **Adhocracy Plus**: Override CSS variables in parent stylesheet

## State Management

### Component Props
- All state managed by parent component
- Component is stateless (controlled component)
- Callbacks for all mutations

### Integration Patterns
- **QADD**: Local state with useState, optional Redux
- **Adhocracy Plus**: Redux Toolkit or local state
