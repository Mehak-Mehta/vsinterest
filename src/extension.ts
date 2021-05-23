import * as vscode from 'vscode';
import { HelloWorldPanel } from './HelloworldPanel';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "vsinterest" is now active!');

	let disposable = vscode.commands.registerCommand('vsinterest.helloWorld', () => {
       HelloWorldPanel.createOrShow(context.extensionUri)
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
