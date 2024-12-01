import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Single interface for Obsidian internals
interface ObsidianInternals {
    commands: {
        removeCommand(id: string): void;
        commands: { [key: string]: any };
    };
    hotkeyManager: {
        customKeys: { [key: string]: any };
        saveCustomKeys(): void;
    };
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
    private currentCommandIDs: Set<string> = new Set();

    async onload() {
        try {
            await this.checkDataFile();
            await this.loadSettings();
            this.addSettingTab(new QuickWrapperSettingsTab(this.app, this));
            this.refreshCommands();
        } catch (error) {
            console.error('Failed to load Quick Wrapper plugin:', error);
        }
    }

    private async checkDataFile() {
        const configDir = this.app.vault.configDir;
        const dataFilePath = `${configDir}/plugins/${this.manifest.id}/data.json`;
        
        const adapter = this.app.vault.adapter;
        const exists = await adapter.exists(dataFilePath);
        
        if (!exists) {
            await adapter.write(dataFilePath, JSON.stringify(DEFAULT_SETTINGS));
        }
    }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshCommands();
	}

    refreshCommands() {
        try {
            const obsidian = this.app as unknown as ObsidianInternals;
            
            // Remove existing commands and their hotkeys
            for (const id of this.currentCommandIDs) {
                try {
                    obsidian.commands.removeCommand(id);
                    if (obsidian.hotkeyManager?.customKeys?.[id]) {
                        delete obsidian.hotkeyManager.customKeys[id];
                        obsidian.hotkeyManager.saveCustomKeys();
                    }
                } catch (err) {
                    console.error(`Failed to remove command ${id}:`, err);
                }
            }
            this.currentCommandIDs.clear();

            // Register new commands with proper ID format
            this.settings.quickTags.forEach((tag) => {
                if (!tag.name || !tag.prefix || !tag.suffix) {
                    return;
                }
                const commandID = `quick-wrapper:wrap-with-${tag.id}`;
                try {
                    this.addCommand({
                        id: commandID,
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
                    this.currentCommandIDs.add(commandID);
                } catch (err) {
                    console.error(`Failed to add command ${commandID}:`, err);
                }
            });
        } catch (error) {
            console.error('Failed to refresh commands:', error);
        }
    }
}

class QuickWrapperSettingsTab extends PluginSettingTab {
	plugin: QuickWrapperPlugin;

	constructor(app: App, plugin: QuickWrapperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Define Quick Tags' });

		this.plugin.settings.quickTags.forEach((tag, index) => {
			const setting = new Setting(containerEl)
				.setName(`Quick Tag ${index + 1}`)
				.addText(text => text
					.setPlaceholder('Name (e.g., kbd)')
					.setValue(tag.name)
					.onChange(async (value) => {
						this.plugin.settings.quickTags[index].name = value;
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder('Prefix (e.g., <kbd>)')
					.setValue(tag.prefix)
					.onChange(async (value) => {
						this.plugin.settings.quickTags[index].prefix = value;
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder('Suffix (e.g., </kbd>)')
					.setValue(tag.suffix)
					.onChange(async (value) => {
						this.plugin.settings.quickTags[index].suffix = value;
						await this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setIcon('trash')
					.onClick(async () => {
						// Remove the quick tag from settings
						this.plugin.settings.quickTags.splice(index, 1);
						// Save the updated settings
						await this.plugin.saveSettings();
						// Refresh the commands to remove the deleted tag's command
						this.plugin.refreshCommands();
						// Update the settings display
						this.display();
					})
				);
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
