// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { HelloWorldPanel } from './HelloworldPanel';
import { SidebarProvider } from "./sidebarProvidar";

export function activate(context: vscode.ExtensionContext) {
	
	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
	  vscode.window.registerWebviewViewProvider(
		"VSInterest-sidebar",
		sidebarProvider
	  )
	);
	console.log('Congratulations, your extension "vs" is now active!');
	let disposable = vscode.commands.registerCommand('vs.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Vsinterest!');
		HelloWorldPanel.createOrShow(context.extensionUri)
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
