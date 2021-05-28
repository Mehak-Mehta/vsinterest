"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const HelloworldPanel_1 = require("./HelloworldPanel");

function activate(context) {
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