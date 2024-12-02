import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Extend the App type to include the commands property
declare module 'obsidian' {
    interface App {
        commands: {
            removeCommand(id: string): void;
            commands: { [key: string]: any };
        };
    }
}

interface QuickTag {
    id: number;
    name: string;
    prefix: string;
    suffix: string;
}

interface QuickWrapperSettings {
    quickTags: QuickTag[];
    nextId: number;
}

const DEFAULT_SETTINGS: QuickWrapperSettings = {
    quickTags: [],
    nextId: 1
}

export default class QuickWrapperPlugin extends Plugin {
    settings: QuickWrapperSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new QuickWrapperSettingsTab(this.app, this));
        this.registerCommands();
        
        // Refresh commands when layout changes
        this.registerEvent(
            this.app.workspace.on('layout-change', () => this.registerCommands())
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.registerCommands();
        this.app.workspace.trigger('layout-change');
    }

    private registerCommands() {
        // Remove existing commands - note that commands will persist until plugin
        // is deactivated or Obsidian is restarted
        Object.keys(this.app.commands.commands)
            .filter(id => id.startsWith('quick-wrapper:wrap-with-'))
            .forEach(id => this.app.commands.removeCommand(id));

        // Add new commands
        this.settings.quickTags.forEach(tag => {
            if (!tag.name || !tag.prefix || !tag.suffix) return;

            this.addCommand({
                id: `quick-wrapper:wrap-with-${tag.id}`,
                name: `Wrap with ${tag.name}`,
                editorCallback: (editor: Editor) => {
                    const selectedText = editor.getSelection();
                    if (!selectedText) {
                        new Notice('Please select some text first');
                        return;
                    }
                    editor.replaceSelection(`${tag.prefix}${selectedText}${tag.suffix}`);
                },
            });
        });
    }
}

class QuickWrapperSettingsTab extends PluginSettingTab {
    constructor(app: App, private plugin: QuickWrapperPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Define Quick Tags' });

        this.plugin.settings.quickTags.forEach((tag, index) => {
            new Setting(containerEl)
                .setName(`Quick Tag ${index + 1}`)
                .addText(text => text
                    .setPlaceholder('Name (e.g., kbd)')
                    .setValue(tag.name)
                    .onChange(async value => {
                        tag.name = value;
                        await this.plugin.saveSettings();
                    }))
                .addText(text => text
                    .setPlaceholder('Prefix (e.g., <kbd>)')
                    .setValue(tag.prefix)
                    .onChange(async value => {
                        tag.prefix = value;
                        await this.plugin.saveSettings();
                    }))
                .addText(text => text
                    .setPlaceholder('Suffix (e.g., </kbd>)')
                    .setValue(tag.suffix)
                    .onChange(async value => {
                        tag.suffix = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .onClick(async () => {
                        this.plugin.settings.quickTags.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .setName('Add Quick Tag')
            .addButton(button => button
                .setButtonText('Add')
                .onClick(async () => {
                    this.plugin.settings.quickTags.push({
                        id: this.plugin.settings.nextId++,
                        name: '',
                        prefix: '',
                        suffix: ''
                    });
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }
}
