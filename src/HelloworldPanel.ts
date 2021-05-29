import * as vscode from "vscode";
import { getNonce } from "./getNonce";
export class HelloWorldPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: HelloWorldPanel | undefined;

  public static readonly viewType = "Hello";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (HelloWorldPanel.currentPanel) {
      HelloWorldPanel.currentPanel._panel.reveal(column);
      HelloWorldPanel.currentPanel._update();
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      HelloWorldPanel.viewType,
      "VSinterest",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
          vscode.Uri.joinPath(extensionUri, "out/compiled"),
        ],
      }
    );

    HelloWorldPanel.currentPanel = new HelloWorldPanel(panel, extensionUri);
  }

  public static kill() {
    HelloWorldPanel.currentPanel?.dispose();
    HelloWorldPanel.currentPanel = undefined;
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    HelloWorldPanel.currentPanel = new HelloWorldPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // // Handle messages from the webview
    // this._panel.webview.onDidReceiveMessage(
    //   (message) => {
    //     switch (message.command) {
    //       case "alert":
    //         vscode.window.showErrorMessage(message.text);
    //         return;
    //     }
    //   },
    //   null,
    //   this._disposables
    // );
  }

  public dispose() {
    HelloWorldPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _update() {
    const webview = this._panel.webview;

    this._panel.webview.html = this._getHtmlForWebview(webview);
    webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
  
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // // And the uri we use to load this script in the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "compiled/helloworld.js")
    );

    // Local path to css styles
    const styleResetPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "reset.css"
    );
    const stylesPathMainPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "vscode.css"
    );

    // Uri to load styles into webview
    const stylesResetUri = webview.asWebviewUri(styleResetPath);
    const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webviews", "components/HelloWorld.svelte")
    );

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content=" img-src https: data:; style-src 'unsafe-inline' ${
      webview.cspSource
    }; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">
        <link href="${cssUri}">
        <script nonce="${nonce}">
        </script>
			</head>
      <body>
			</body>
				<script nonce="${nonce}" src="${cssUri}">
        import Hidden from "../webviews/components/hidden.svelte"
        import HelloWorld from "../webviews/components/HelloWorld.svelte"
        
        let child;
	      let classname;
	      let name;
	      let hname;
        </script>
        <div class="header">
<strong> VSInterest: </strong>
<link href= "./out/compiled/helloworld.css" rel = "stylesheet">
</div>
<p> Here you can find Github repos of similar languages.</p>
<p> Here is the <a href="https://github.com/Mehak-Mehta/VSInterest"> Source Code </a>.</p>


Select language: 
<button>Python</button>

<Hidden >
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Sudoku-Solver">Sudoku Solver</a>
	<p> Sudoku Solver Using Backtracing Algorithum</p>
	</li>
	</div>

	<div class="Acc">
	<li><a href="https://github.com/Mehak-Mehta/Account-Storage">Account Storage</a>
	<p> GUI for Account Storage Using tkinter</p>
	</li>
	</div>

	<div class="pass">
	<li><a href="https://github.com/Mehak-Mehta/Password-Generator">PassWord Generator</a>
	<p> Simple PassWord Generator Using Python</p>
	</li>
	</div>
	
</Hidden>

<button>JavaScript</button>

<Hidden >
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Apollo-GraphQL-Server">Apollo GraphQL Server</a>
	<p>Apollo graphql server with express and mongoDB</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Express.js-API">Express.js API</a>
	</li>
	<p>REST API Using Node , Express , MongoDB</p>
	</div>
	
	<div class="links">
	<li><a href="https://github.com/Mehak-Mehta/HunterxHunter-Web">Hunter x Hunter</a>
	</li>
	<p>Front-end Hunter x Hunter Web Using React.</p>
	</div>
</Hidden>

<button >TypeScript</button>
<Hidden >
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Nest-GraphQL-Server">Nest GraphQL Server</a>
	<p> Nest graphql server with mongoDB</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/benawad/vstodo">vstodo</a>
	</li>
	<p>Todo list for VSCode</p> <strong>Owner: benawad</strong>
	</div>
	
	<div class="links">
	<li><a href="https://github.com/bradtraversy/deno-rest-api">deno rest api</a>
	</li>
	<p>Simple REST API using Deno and Oak</p> <strong>Owner: bradtraversy</strong>
	</div>
</Hidden>
<button>Html & CSS</button>
<Hidden>
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/WebTemp">Website Template</a>
	<p > Basic HTML Website</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/Alicunde/HTML">HTML elements</a>
	<p>Set of simplified and stylized HTML elements</p> <strong>Owner: Alicunde</strong>
	</li>
	
	</div>
	
	<div class="links">
	<li><a href="https://github.com/bornmay/Responsive-Portfolio">Responsive Portfolio</a>
	<p>This is a Responsive Portfolio Website</p> <strong>Owner: bornmay </strong>
	</li>
	
	</div>
</Hidden>


<div> More languages coming soon!!</div>

<div color: pink> Made By <a href="https://github.com/Mehak-Mehta">Mehak Mehta</a></div>

			</html>`;
  }
}