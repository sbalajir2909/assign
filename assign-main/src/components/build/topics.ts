import {
  Globe,
  Terminal,
  Database,
  Layers,
  Server,
  Cpu,
  Table2,
  Brain,
  Code2,
  Shuffle,
  Lock,
  BarChart3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Language = 'JavaScript' | 'Python' | 'TypeScript'

export type Topic = {
  id: string
  name: string
  icon: LucideIcon
  description: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  tags: string[]
  popular: boolean
  languages: Language[]
  project: string
  projectDesc: string
  tasks: string[]
  starterCode: Partial<Record<Language, string>>
  hints: string[]
  aiOpener: string
}

export const TOPICS: Topic[] = [
  {
    id: 'web-dev',
    name: 'Web Development',
    icon: Globe,
    description: 'Build interactive pages with HTML, CSS & JavaScript',
    difficulty: 'Beginner',
    tags: ['HTML', 'CSS', 'JavaScript'],
    popular: true,
    languages: ['JavaScript', 'TypeScript'],
    project: 'Build a Task Manager',
    projectDesc:
      "Build a simple task manager that lets users add, complete, and delete tasks. It'll teach you functions, arrays, and how UIs respond to user actions.",
    tasks: [
      'Create an array to hold tasks',
      'Write an addTask(text) function that adds to the array',
      'Write a completeTask(id) that marks a task done',
      'Write a deleteTask(id) that removes from the array',
      'Write a getTasks() that returns all tasks',
    ],
    starterCode: {
      JavaScript: `// Task Manager
// Your job: manage a list of tasks

let tasks = [];
let nextId = 1;

function addTask(text) {
  // Add a new task object to tasks
  // Each task should have: id, text, completed: false
  
}

function completeTask(id) {
  // Find the task with matching id
  // Set its completed property to true
  
}

function deleteTask(id) {
  // Remove the task with matching id from the array
  
}

function getTasks() {
  // Return the full tasks array
  
}
`,
      TypeScript: `// Task Manager
type Task = { id: number; text: string; completed: boolean };

let tasks: Task[] = [];
let nextId = 1;

function addTask(text: string): void {
  // Add a new task to tasks
  
}

function completeTask(id: number): void {
  // Mark task with matching id as completed
  
}

function deleteTask(id: number): void {
  // Remove task with matching id
  
}

function getTasks(): Task[] {
  return tasks;
}
`,
    },
    hints: [
      'For addTask: use tasks.push({ id: nextId++, text, completed: false })',
      'For completeTask: use tasks.find(t => t.id === id) to get the task, then set .completed = true',
      'For deleteTask: tasks = tasks.filter(t => t.id !== id)',
    ],
    aiOpener:
      "Alright! We're building a task manager today. It's a great first project. You'll learn how to work with arrays, objects, and functions all in one go. Start with the addTask function and we'll go from there.",
  },
  {
    id: 'python-basics',
    name: 'Python Basics',
    icon: Terminal,
    description: 'Variables, loops, functions - Python from scratch',
    difficulty: 'Beginner',
    tags: ['Python', 'Scripting'],
    popular: true,
    languages: ['Python'],
    project: 'Build a Temperature Converter',
    projectDesc:
      "Build a utility that converts temperatures between Celsius, Fahrenheit, and Kelvin. You'll practice functions, math, and conditional logic.",
    tasks: [
      'Write celsius_to_fahrenheit(c) function',
      'Write fahrenheit_to_celsius(f) function',
      'Write celsius_to_kelvin(c) function',
      'Write a convert(value, from_unit, to_unit) dispatcher',
      'Handle invalid unit inputs gracefully',
    ],
    starterCode: {
      Python: `# Temperature Converter
# Build a utility to convert between temperature scales

def celsius_to_fahrenheit(c):
    # Formula: (c * 9/5) + 32
    pass

def fahrenheit_to_celsius(f):
    # Formula: (f - 32) * 5/9
    pass

def celsius_to_kelvin(c):
    # Formula: c + 273.15
    pass

def convert(value, from_unit, to_unit):
    # Dispatch to the right function based on units
    # from_unit and to_unit are strings like "C", "F", "K"
    pass

# Test it:
# print(celsius_to_fahrenheit(100))  # Should be 212.0
`,
    },
    hints: [
      'celsius_to_fahrenheit: return (c * 9/5) + 32',
      "For the convert() dispatcher: use if/elif to match unit combinations like 'C' to 'F'",
      "Don't forget to handle the case where from_unit == to_unit (just return the value)",
    ],
    aiOpener:
      "Python is one of the most readable languages out there. Today we're building a temperature converter. Simple enough to focus on Python syntax, useful enough to actually learn something. Start with celsius_to_fahrenheit.",
  },
  {
    id: 'data-structures',
    name: 'Data Structures',
    icon: Database,
    description: 'Stacks, queues, linked lists - the fundamentals',
    difficulty: 'Intermediate',
    tags: ['CS', 'Algorithms', 'Data'],
    popular: true,
    languages: ['JavaScript', 'Python'],
    project: 'Build a Stack',
    projectDesc:
      'Implement a Stack data structure from scratch. Stacks are fundamental to how computers work, from function calls to undo history in apps.',
    tasks: [
      'Create a Stack class with an internal array',
      'Implement push(item) - adds to the top',
      'Implement pop() - removes and returns from the top',
      'Implement peek() - returns top without removing',
      'Implement isEmpty() and size()',
    ],
    starterCode: {
      JavaScript: `// Stack Data Structure
// A stack is LIFO - Last In, First Out

class Stack {
  constructor() {
    this.items = [];
  }

  push(item) {
    // Add item to the top of the stack
    
  }

  pop() {
    // Remove and return the top item
    // Return undefined if stack is empty
    
  }

  peek() {
    // Return the top item WITHOUT removing it
    
  }

  isEmpty() {
    // Return true if the stack has no items
    
  }

  size() {
    // Return the number of items
    
  }
}

// Usage:
// const s = new Stack();
// s.push("hello");
// s.peek(); // "hello"
`,
      Python: `# Stack Data Structure
# A stack is LIFO - Last In, First Out

class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        # Add item to the top
        pass

    def pop(self):
        # Remove and return top item
        # Return None if empty
        pass

    def peek(self):
        # Return top item without removing
        pass

    def is_empty(self):
        # Return True if no items
        pass

    def size(self):
        # Return number of items
        pass
`,
    },
    hints: [
      'push: use this.items.push(item) - arrays already work like stacks',
      'pop: check isEmpty() first, then use this.items.pop()',
      'peek: return this.items[this.items.length - 1]',
    ],
    aiOpener:
      "Data structures are the backbone of computer science. We're implementing a Stack today. It's a deceptively simple concept that shows up everywhere, from browser history to compiler design. Start with push().",
  },
  {
    id: 'react-basics',
    name: 'React Basics',
    icon: Layers,
    description: 'Components, props, and hooks - the React way',
    difficulty: 'Intermediate',
    tags: ['React', 'JavaScript', 'UI'],
    popular: true,
    languages: ['JavaScript', 'TypeScript'],
    project: 'Build a Search Filter',
    projectDesc:
      "Build a React component with a live search filter. As the user types, the list updates in real time. You'll learn useState, event handling, and conditional rendering.",
    tasks: [
      'Create a SearchFilter component with a useState hook',
      'Render an input field that updates state on change',
      'Filter the FRUITS array based on the search term',
      'Render the filtered list below the input',
      "Show 'No results' when the filter has no matches",
    ],
    starterCode: {
      JavaScript: `// React Search Filter
// Note: In a real React app this would be a .jsx file

const FRUITS = [
  "Apple", "Banana", "Cherry", "Dragonfruit",
  "Elderberry", "Fig", "Grape", "Honeydew"
];

function SearchFilter() {
  // Create state for the search term
  const [query, setQuery] = React.useState("");

  // Filter the FRUITS array based on query
  const filtered = /* your filter logic here */;

  return (
    <div>
      <input
        type="text"
        placeholder="Search fruits..."
        value={query}
        onChange={/* handle input change */}
      />
      
      {/* Render filtered list here */}
      {/* Show "No results found." if filtered is empty */}
    </div>
  );
}
`,
      TypeScript: `// React Search Filter (TypeScript)

const FRUITS: string[] = [
  "Apple", "Banana", "Cherry", "Dragonfruit",
  "Elderberry", "Fig", "Grape", "Honeydew"
];

function SearchFilter(): JSX.Element {
  const [query, setQuery] = React.useState<string>("");

  const filtered: string[] = /* filter FRUITS by query */;

  return (
    <div>
      <input
        type="text"
        placeholder="Search fruits..."
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          /* update query state */
        }}
      />
      {/* render filtered or "No results" */}
    </div>
  );
}
`,
    },
    hints: [
      'Filter: FRUITS.filter(f => f.toLowerCase().includes(query.toLowerCase()))',
      'onChange: e => setQuery(e.target.value)',
      'For the list: filtered.map(f => <div key={f}>{f}</div>)',
    ],
    aiOpener:
      "React's superpower is making UIs reactive. The UI automatically updates when data changes. Today we're building a live search filter. Start with the filter logic.",
  },
  {
    id: 'algorithms',
    name: 'Algorithms',
    icon: Cpu,
    description: 'Sorting, searching, recursion - how to think in code',
    difficulty: 'Intermediate',
    tags: ['CS', 'Algorithms', 'Problem Solving'],
    popular: false,
    languages: ['JavaScript', 'Python'],
    project: 'Build Binary Search',
    projectDesc:
      "Implement binary search - the algorithm that powers search in databases, autocomplete, and almost everything at scale. It's fast: O(log n) vs O(n) for linear search.",
    tasks: [
      'Understand: the array must be sorted first',
      'Set low = 0 and high = array.length - 1',
      'Loop while low <= high',
      'Calculate mid = Math.floor((low + high) / 2)',
      'Return mid if found, adjust low/high otherwise',
    ],
    starterCode: {
      JavaScript: `// Binary Search
// Returns the INDEX of target in a sorted array
// Returns -1 if not found

function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    // Calculate the middle index
    let mid = /* ? */;

    if (arr[mid] === target) {
      return mid; // Found it!
    } else if (arr[mid] < target) {
      // Target is in the right half
      low = /* ? */;
    } else {
      // Target is in the left half
      high = /* ? */;
    }
  }

  return -1; // Not found
}

// Test:
// const sorted = [1, 3, 5, 7, 9, 11, 15, 20];
// binarySearch(sorted, 7); // should return 3 (index)
`,
      Python: `# Binary Search
# Returns index of target in sorted array, or -1

def binary_search(arr, target):
    low = 0
    high = len(arr) - 1

    while low <= high:
        mid = # calculate middle index
        
        if arr[mid] == target:
            return mid  # Found!
        elif arr[mid] < target:
            low = # move right
        else:
            high = # move left

    return -1  # Not found
`,
    },
    hints: [
      'mid = Math.floor((low + high) / 2)',
      'When arr[mid] < target, the value is to the right: low = mid + 1',
      'When arr[mid] > target, the value is to the left: high = mid - 1',
    ],
    aiOpener:
      "Binary search only works on sorted arrays. That's the whole trick. We're implementing it from scratch, step by step.",
  },
  {
    id: 'api-building',
    name: 'Build an API',
    icon: Server,
    description: 'REST endpoints, routing, HTTP methods',
    difficulty: 'Intermediate',
    tags: ['Node.js', 'API', 'Backend'],
    popular: false,
    languages: ['JavaScript', 'Python'],
    project: 'Build a URL Router',
    projectDesc:
      'Build a simple URL router that maps paths to handlers - the core of every web framework. This is how Express, Flask, and FastAPI work under the hood.',
    tasks: [
      'Create a Router class with a routes map',
      'Implement get(path, handler) and post(path, handler)',
      'Implement dispatch(method, path) to call the right handler',
      'Return a 404 handler for unmatched routes',
      'Support path parameters like /users/:id',
    ],
    starterCode: {
      JavaScript: `// URL Router - the heart of every web framework

class Router {
  constructor() {
    this.routes = {}; // { "GET /path": handler }
  }

  get(path, handler) {
    // Register a GET route
    this.routes[\`GET \${path}\`] = handler;
  }

  post(path, handler) {
    // Register a POST route
    
  }

  dispatch(method, path) {
    // Find and call the matching handler
    // Return { status: 404, body: "Not Found" } if no match
    const key = \`\${method.toUpperCase()} \${path}\`;
    
  }
}

// Usage:
// const router = new Router();
// router.get("/hello", () => ({ status: 200, body: "Hi!" }));
// router.dispatch("GET", "/hello"); // { status: 200, body: "Hi!" }
`,
      Python: `# URL Router

class Router:
    def __init__(self):
        self.routes = {}  # { "GET /path": handler }

    def get(self, path, handler):
        # Register a GET route
        self.routes[f"GET {path}"] = handler

    def post(self, path, handler):
        # Register a POST route
        pass

    def dispatch(self, method, path):
        # Find and call matching handler
        # Return {"status": 404, "body": "Not Found"} if no match
        key = f"{method.upper()} {path}"
        pass
`,
    },
    hints: [
      'For dispatch: check if the key exists in this.routes, then call routes[key]()',
      "404 fallback: if (!this.routes[key]) return { status: 404, body: 'Not Found' }",
      'The handler should be called and its return value returned by dispatch',
    ],
    aiOpener:
      "Every web framework you use is built on a router at its core. We're building one from scratch today. Start with get().",
  },
  {
    id: 'sql-basics',
    name: 'SQL & Databases',
    icon: Table2,
    description: 'Write queries that actually do something useful',
    difficulty: 'Beginner',
    tags: ['SQL', 'Databases', 'Data'],
    popular: false,
    languages: ['JavaScript'],
    project: 'Query a Book Library',
    projectDesc:
      "Practice writing SQL queries for a book library database. You'll write real queries for selecting, filtering, joining, and aggregating data.",
    tasks: [
      'Select all books from the books table',
      'Filter books published after 2010',
      'Join books with authors table to get author names',
      'Count books per genre using GROUP BY',
      'Find the top 3 most recent books',
    ],
    starterCode: {
      JavaScript: `// SQL Queries - Book Library
// Write each query as a string

// 1. Get all books
const getAllBooks = \`
  SELECT * FROM books;
\`;

// 2. Get books published after 2010
const recentBooks = \`
  SELECT * FROM books
  WHERE /* your condition here */;
\`;

// 3. Get books with author names (join)
const booksWithAuthors = \`
  SELECT books.title, authors.name as author_name
  FROM books
  /* JOIN authors here */
  ON /* match condition */;
\`;

// 4. Count books per genre
const countByGenre = \`
  SELECT genre, COUNT(*) as total
  FROM books
  /* GROUP the results */;
\`;

// 5. Top 3 most recent books
const top3Recent = \`
  SELECT title, year FROM books
  ORDER BY year DESC
  /* LIMIT the results */;
\`;
`,
    },
    hints: [
      'WHERE published_year > 2010',
      'JOIN authors ON books.author_id = authors.id',
      'GROUP BY genre - this goes after WHERE if you have one',
    ],
    aiOpener:
      "SQL is a hireable skill in almost every field. We're writing real queries today against a book library schema. Start simple and build up.",
  },
  {
    id: 'machine-learning',
    name: 'ML Basics',
    icon: Brain,
    description: 'Train your first model - no black boxes, just math',
    difficulty: 'Advanced',
    tags: ['Python', 'ML', 'Data Science'],
    popular: false,
    languages: ['Python'],
    project: 'Build a Linear Classifier',
    projectDesc:
      "Build a simple linear classifier from scratch using gradient descent. No libraries - just Python and math. You'll understand what neural networks actually do at their core.",
    tasks: [
      'Initialize weights and bias to zero',
      'Write a predict(x) function using the linear formula',
      'Write a loss function (mean squared error)',
      'Write a train step that updates weights',
      'Run training for 100 iterations and watch loss drop',
    ],
    starterCode: {
      Python: `# Linear Classifier from Scratch
# y = w * x + b  (the core equation)

import math

class LinearClassifier:
    def __init__(self):
        self.w = 0.0  # weight
        self.b = 0.0  # bias
        self.lr = 0.01  # learning rate

    def predict(self, x):
        # Return w * x + b
        pass

    def loss(self, predictions, targets):
        # Mean Squared Error: average of (pred - target)^2
        pass

    def train_step(self, X, y):
        # 1. Get predictions for all X
        # 2. Calculate gradients (derivative of loss)
        # 3. Update self.w and self.b
        pass

# Training data: y = 2x + 1
X_train = [1, 2, 3, 4, 5]
y_train = [3, 5, 7, 9, 11]

model = LinearClassifier()
# Train for 100 steps and print the loss
`,
    },
    hints: [
      'predict: return self.w * x + self.b',
      'loss (MSE): sum((p - t)**2 for p, t in zip(preds, targets)) / len(targets)',
      'Gradient for w: mean of (2 * (pred - target) * x). Update: self.w -= lr * grad_w',
    ],
    aiOpener:
      "Machine learning looks like magic until you implement it yourself. We're building a linear classifier from pure Python math today. Once you write the train step by hand, the abstractions make sense.",
  },
  {
    id: 'sorting',
    name: 'Sorting Algorithms',
    icon: Shuffle,
    description: "Bubble sort to merge sort - know what you're using",
    difficulty: 'Intermediate',
    tags: ['CS', 'Algorithms'],
    popular: false,
    languages: ['JavaScript', 'Python'],
    project: 'Implement Merge Sort',
    projectDesc:
      "Build merge sort - the algorithm behind JavaScript's Array.sort(), Python's sorted(), and most production sorting. It's O(n log n) and teaches divide-and-conquer thinking.",
    tasks: [
      'Write a merge(left, right) function that merges two sorted arrays',
      'Write mergeSort(arr) that splits the array in half',
      'Recursively sort each half',
      'Merge the sorted halves back together',
      'Test with [38, 27, 43, 3, 9, 82, 10]',
    ],
    starterCode: {
      JavaScript: `// Merge Sort
// Divide and conquer: split, sort, merge

function merge(left, right) {
  // Merge two ALREADY-SORTED arrays into one sorted array
  const result = [];
  let i = 0, j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }

  // Don't forget to add remaining elements.
  return result.concat(/* remaining from left */).concat(/* remaining from right */);
}

function mergeSort(arr) {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = /* left half of arr */;
  const right = /* right half of arr */;

  return merge(
    mergeSort(/* sort left */),
    mergeSort(/* sort right */)
  );
}
`,
      Python: `# Merge Sort

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    return result + left[i:] + right[j:]

def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = # calculate midpoint
    left = # left half
    right = # right half
    return merge(
        merge_sort(# sort left),
        merge_sort(# sort right)
    )
`,
    },
    hints: [
      'For the remaining: left.slice(i) catches any leftover from left array',
      'Split: left = arr.slice(0, mid), right = arr.slice(mid)',
      'The merge is the hard part - focus there first',
    ],
    aiOpener:
      "Merge sort is both interview material and production reality. The merge function is the heart of it. Start there.",
  },
  {
    id: 'auth-basics',
    name: 'Auth & Security',
    icon: Lock,
    description: 'Passwords, hashing, JWT - how auth actually works',
    difficulty: 'Advanced',
    tags: ['Security', 'Backend', 'Node.js'],
    popular: false,
    languages: ['JavaScript'],
    project: 'Build a Password Hasher',
    projectDesc:
      'Implement password hashing and verification the right way. You will understand why you never store plain-text passwords and how salt prevents rainbow table attacks.',
    tasks: [
      'Write a generateSalt() that creates a random salt string',
      'Write a hashPassword(password, salt) function',
      'Write a verifyPassword(input, hash, salt) function',
      'Write a createUser(username, password) function',
      'Write a loginUser(username, input, storedUser) function',
    ],
    starterCode: {
      JavaScript: `// Password Security
// In real code you'd use bcrypt - this shows you the concepts

function generateSalt(length = 16) {
  // Create a random string of 'length' characters
  // Use: Math.random().toString(36) and substring it
  
}

function hashPassword(password, salt) {
  // Combine password + salt, then "hash" it
  // For demo: we'll do a simple djb2-style hash
  const combined = password + salt;
  let hash = 5381;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) + hash) + combined.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit int
  }
  return hash.toString(16);
}

function verifyPassword(input, storedHash, salt) {
  // Hash the input with the same salt, compare to storedHash
  
}

function createUser(username, password) {
  // Return { username, salt, hash }
  
}

function loginUser(username, input, storedUser) {
  // Return true if input matches storedUser's password
  
}
`,
    },
    hints: [
      'generateSalt: Math.random().toString(36).substring(2, 2 + length)',
      'verifyPassword: return hashPassword(input, salt) === storedHash',
      'createUser: const salt = generateSalt(); return { username, salt, hash: hashPassword(password, salt) }',
    ],
    aiOpener:
      "Security makes more sense when you implement the concepts yourself. Today we're doing salt and hash, not storing plain text.",
  },
  {
    id: 'data-viz',
    name: 'Data Visualization',
    icon: BarChart3,
    description: 'Turn raw numbers into insights with charts',
    difficulty: 'Beginner',
    tags: ['Data', 'JavaScript', 'Charts'],
    popular: false,
    languages: ['JavaScript'],
    project: 'Build a Bar Chart',
    projectDesc:
      'Build a bar chart renderer that takes data and outputs ASCII or SVG bars. Understanding how to map data to visual dimensions is the foundation of charting libraries.',
    tasks: [
      'Write a normalizeData(data) that scales values to 0–100',
      'Write a renderBar(value, maxWidth) that creates a text bar',
      'Write a renderChart(data) that renders all bars with labels',
      'Sort bars by value (descending)',
      'Add percentage labels at the end of each bar',
    ],
    starterCode: {
      JavaScript: `// Bar Chart Builder
// Maps data values to ASCII bars

const data = [
  { label: "React",      value: 89 },
  { label: "Vue",        value: 42 },
  { label: "Angular",    value: 31 },
  { label: "Svelte",     value: 18 },
  { label: "Vanilla JS", value: 71 },
];

function normalizeData(data) {
  // Find the max value, then scale all values to 0–100
  const max = /* find max */;
  return data.map(d => ({ ...d, normalized: (d.value / max) * 100 }));
}

function renderBar(normalizedValue, maxWidth = 40) {
  // Return a string of '█' characters
  // Length should be proportional to normalizedValue (0–100)
  const filled = Math.round(/* calculate filled width */);
  return "█".repeat(filled);
}

function renderChart(data) {
  const normalized = normalizeData(data);
  const sorted = /* sort by value descending */;

  return sorted.map(d => {
    const bar = renderBar(d.normalized);
    const label = d.label.padEnd(12);
    return \`\${label} \${bar} \${d.value}\`;
  }).join("\\n");
}

console.log(renderChart(data));
`,
    },
    hints: [
      'Find max: Math.max(...data.map(d => d.value))',
      'Bar width: Math.round((normalizedValue / 100) * maxWidth)',
      'Sort: [...normalized].sort((a, b) => b.value - a.value)',
    ],
    aiOpener:
      "Data visualization is about mapping numbers to visual properties like width and height. Build that mapping manually once and every chart library feels less magical.",
  },
  {
    id: 'oop-basics',
    name: 'Object-Oriented Design',
    icon: Code2,
    description: 'Classes, inheritance, encapsulation - OOP that makes sense',
    difficulty: 'Intermediate',
    tags: ['OOP', 'Design Patterns', 'JavaScript'],
    popular: false,
    languages: ['JavaScript', 'TypeScript', 'Python'],
    project: 'Build a Shape Calculator',
    projectDesc:
      'Design a class hierarchy for shapes. You will use inheritance, method overriding, and polymorphism - the core OOP concepts that appear in professional codebases.',
    tasks: [
      'Create a base Shape class with a name property',
      "Add an area() method that throws 'Not implemented'",
      'Create Circle class extending Shape with a radius',
      'Create Rectangle class with width and height',
      'Create Triangle class with base and height',
    ],
    starterCode: {
      JavaScript: `// Shape Calculator - OOP Design
// Base class → subclasses override area()

class Shape {
  constructor(name) {
    this.name = name;
  }

  area() {
    throw new Error(\`\${this.name}: area() not implemented\`);
  }

  describe() {
    return \`\${this.name}: area = \${this.area().toFixed(2)}\`;
  }
}

class Circle extends Shape {
  constructor(radius) {
    super("Circle");
    this.radius = radius;
  }

  area() {
    // πr²
    return /* formula */;
  }
}

class Rectangle extends Shape {
  constructor(width, height) {
    super("Rectangle");
    // store width and height
    
  }

  area() {
    // width × height
    
  }
}

class Triangle extends Shape {
  // Add constructor and area()
  // area = 0.5 × base × height
  
}
`,
      TypeScript: `// Shape Calculator (TypeScript)

abstract class Shape {
  constructor(public name: string) {}
  abstract area(): number;
  describe(): string {
    return \`\${this.name}: area = \${this.area().toFixed(2)}\`;
  }
}

class Circle extends Shape {
  constructor(public radius: number) {
    super("Circle");
  }
  area(): number {
    return /* πr² */;
  }
}

class Rectangle extends Shape {
  constructor(public width: number, public height: number) {
    super("Rectangle");
  }
  area(): number {
    return /* w × h */;
  }
}

class Triangle extends Shape {
  constructor(public base: number, public height: number) {
    super("Triangle");
  }
  area(): number {
    return /* 0.5 × b × h */;
  }
}
`,
      Python: `# Shape Calculator (Python OOP)

import math

class Shape:
    def __init__(self, name):
        self.name = name

    def area(self):
        raise NotImplementedError(f"{self.name}: area() not implemented")

    def describe(self):
        return f"{self.name}: area = {self.area():.2f}"

class Circle(Shape):
    def __init__(self, radius):
        super().__init__("Circle")
        self.radius = radius

    def area(self):
        return # math.pi * r^2

class Rectangle(Shape):
    def __init__(self, width, height):
        super().__init__("Rectangle")
        # store width, height
        pass

    def area(self):
        return # w * h

class Triangle(Shape):
    # implement this
    pass
`,
    },
    hints: [
      'Circle area: Math.PI * this.radius ** 2',
      'Rectangle: store width and height in the constructor and return width * height',
      'Triangle: area = 0.5 * base * height',
    ],
    aiOpener:
      "Object-oriented programming clicks when you see a real use case. Shapes are the classic intro for a reason. Start with Circle.",
  },
]

export const SEARCH_SUGGESTIONS = [
  'web development',
  'python',
  'javascript',
  'algorithms',
  'data structures',
  'react',
  'API',
  'SQL',
  'machine learning',
  'sorting',
  'binary search',
  'functions',
  'arrays',
  'classes',
  'recursion',
]
