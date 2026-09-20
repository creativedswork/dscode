export interface SimpleShellCommand {
  commandClass: string;
  args: string[];
}

export function parseSimpleShellCommand(command: string): SimpleShellCommand | undefined {
  const words: string[] = [];
  let word = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;

  const pushWord = () => {
    if (word) words.push(word);
    word = "";
  };

  for (let index = 0; index < command.length; index++) {
    const character = command[index]!;
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (character === quote) {
      quote = undefined;
      continue;
    }
    if (!quote && (character === "'" || character === "\"")) {
      quote = character;
      continue;
    }
    if (quote !== "'" && character === "$" && command[index + 1] === "(") {
      return undefined;
    }
    if (quote !== "'" && character === "`") return undefined;
    if (!quote && /[\n\r|&;<>()]/.test(character)) return undefined;
    if (!quote && /\s/.test(character)) {
      pushWord();
      continue;
    }
    word += character;
  }
  if (quote || escaped) return undefined;
  pushWord();
  const commandIndex = words.findIndex((candidate) =>
    !/^[A-Za-z_][A-Za-z0-9_]*=/.test(candidate)
  );
  if (commandIndex < 0) return undefined;
  return {
    commandClass: words[commandIndex]!.toLowerCase(),
    args: words.slice(commandIndex + 1),
  };
}
