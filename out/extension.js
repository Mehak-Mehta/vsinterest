"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const HelloworldPanel_1 = require("./HelloworldPanel");
function activate(context) {
    console.log('Congratulations, your extension "vs" is now active!');
    let disposable = vscode.commands.registerCommand("vs.helloworld", () => {
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