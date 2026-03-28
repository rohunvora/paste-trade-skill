import { spawn } from "child_process";
import { validateRemoteUrl } from "../shared/url-safety";

export function openUrlInBrowser(url: string): boolean {
  const validated = validateRemoteUrl(url);
  if (!validated.ok) return false;

  const href = validated.url!.toString();
  let command: string;
  let args: string[];

  if (process.platform === "darwin") {
    command = "open";
    args = [href];
  } else if (process.platform === "linux") {
    command = "xdg-open";
    args = [href];
  } else if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", href];
  } else {
    return false;
  }

  try {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
      shell: false,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
