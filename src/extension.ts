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
  

	let disposable = vscode.commands.registerCommand('vsinterest.helloWorld', () => {
       HelloWorldPanel.createOrShow(context.extensionUri)
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
