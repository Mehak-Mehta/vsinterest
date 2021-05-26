"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const HelloworldPanel_1 = require("./HelloworldPanel");
const sidebarProvidar_1 = require("./sidebarProvidar");
function activate(context) {
    const sidebarProvider = new sidebarProvidar_1.SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("VSInterest-sidebar", sidebarProvider));
    console.log('Congratulations, your extension "vs" is now active!');
    let disposable = vscode.commands.registerCommand('vs.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Vsinterest!');
        HelloworldPanel_1.HelloWorldPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map