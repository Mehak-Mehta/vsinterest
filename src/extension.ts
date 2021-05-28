import * as vscode from 'vscode';
import { HelloWorldPanel } from './HelloworldPanel';
export function activate(context: vscode.ExtensionContext) {
	
	console.log('Congratulations, your extension "vs" is now active!');
	let disposable = vscode.commands.registerCommand('vs.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Vsinterest!');
		HelloWorldPanel.createOrShow(context.extensionUri)
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}