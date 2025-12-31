import { App, ISuggestOwner, Scope } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";

export abstract class TextInputSuggest<T> implements ISuggestOwner<T> {
    protected app: App;
    protected inputEl: HTMLInputElement;
    private popper: PopperInstance;
    private scope: Scope;
    private suggestEl: HTMLElement;
    private suggestions: T[];

    constructor(app: App, inputEl: HTMLInputElement) {
        this.app = app;
        this.inputEl = inputEl;
        this.scope = new Scope();

        this.suggestEl = createDiv("suggestion-container");
        const suggestionContent = this.suggestEl.createDiv("suggestion");

        this.inputEl.addEventListener("input", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("focus", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("blur", () => {
            // Delay close to allow click events to fire first
            setTimeout(() => this.close(), 200);
        });

        this.scope.register([], "Escape", this.close.bind(this));
    }

    onInputChanged(): void {
        const inputStr = this.inputEl.value;
        const suggestions = this.getSuggestions(inputStr);

        if (suggestions.length > 0) {
            this.suggestions = suggestions;
            this.open();
        } else {
            this.close();
        }
    }

    open(): void {
        this.app.keymap.pushScope(this.scope);
        document.body.appendChild(this.suggestEl);

        this.popper = createPopper(this.inputEl, this.suggestEl, {
            placement: "bottom-start",
            modifiers: [
                {
                    name: "sameWidth",
                    enabled: true,
                    fn: ({ state, instance }) => {
                        const targetWidth = `${state.rects.reference.width}px`;
                        if (state.styles.popper.width === targetWidth) {
                            return;
                        }
                        state.styles.popper.width = targetWidth;
                        instance.update();
                    },
                    phase: "beforeWrite",
                    requires: ["computeStyles"],
                },
            ],
        });

        this.renderSuggestions();
    }

    close(): void {
        this.app.keymap.popScope(this.scope);
        this.suggestions = [];
        if (this.popper) {
            this.popper.destroy();
        }
        this.suggestEl.detach();
    }

    renderSuggestions(): void {
        const suggestionContent = this.suggestEl.querySelector(".suggestion");
        if (suggestionContent) {
            suggestionContent.empty();

            this.suggestions.forEach((item) => {
                const suggestionItem = suggestionContent.createDiv("suggestion-item");
                this.renderSuggestion(item, suggestionItem);

                suggestionItem.addEventListener("mousedown", (event) => {
                    event.preventDefault(); // Prevent blur event
                });

                suggestionItem.addEventListener("click", (event) => {
                    event.preventDefault();
                    this.selectSuggestion(item);
                    this.close();
                });
            });
        }
    }

    abstract getSuggestions(inputStr: string): T[];
    abstract renderSuggestion(item: T, el: HTMLElement): void;
    abstract selectSuggestion(item: T): void;
}
