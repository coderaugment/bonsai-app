import fs from 'fs';
import path from 'path';

export interface TechStack {
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  hasTypeScript: boolean;
  hasLinter: boolean;
  hasFormatter: boolean;
}

export function detectTechStack(workspacePath: string): TechStack {
  const stack: TechStack = {
    languages: [],
    frameworks: [],
    hasTypeScript: false,
    hasLinter: false,
    hasFormatter: false,
  };

  // Check for package.json (Node.js)
  const packageJsonPath = path.join(workspacePath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    stack.languages.push('JavaScript');
    stack.packageManager = 'npm';

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Detect frameworks
      if (allDeps['next']) stack.frameworks.push('Next.js');
      if (allDeps['react']) stack.frameworks.push('React');
      if (allDeps['vue']) stack.frameworks.push('Vue');
      if (allDeps['express']) stack.frameworks.push('Express');
    } catch {
      // Malformed package.json, skip framework detection
    }
  }

  // Check for TypeScript
  if (fs.existsSync(path.join(workspacePath, 'tsconfig.json'))) {
    stack.hasTypeScript = true;
    stack.languages.push('TypeScript');
  }

  // Check for Rust
  if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
    stack.languages.push('Rust');
  }

  // Check for Go
  if (fs.existsSync(path.join(workspacePath, 'go.mod'))) {
    stack.languages.push('Go');
  }

  // Check for Python
  if (fs.existsSync(path.join(workspacePath, 'requirements.txt')) ||
      fs.existsSync(path.join(workspacePath, 'pyproject.toml'))) {
    stack.languages.push('Python');
  }

  // Check for linter/formatter
  stack.hasLinter = fs.existsSync(path.join(workspacePath, '.eslintrc.json')) ||
                    fs.existsSync(path.join(workspacePath, '.eslintrc.js'));
  stack.hasFormatter = fs.existsSync(path.join(workspacePath, '.prettierrc'));

  return stack;
}

export function loadClaudeMd(workspacePath: string): string | null {
  const claudeMdPath = path.join(workspacePath, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    return fs.readFileSync(claudeMdPath, 'utf-8');
  }
  return null;
}
