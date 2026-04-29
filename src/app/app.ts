import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToscaniniChatComponent } from './shared/components/toscanini-chat/toscanini-chat';
import { ConfirmModalComponent } from './shared/components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'orq-root',
  imports: [RouterOutlet, ToscaniniChatComponent, ConfirmModalComponent],
  template: `
    <router-outlet />
    <app-toscanini-chat />
    <orq-confirm-modal />
  `,
  styles: `:host { display: block; height: 100vh; }`
})
export class App {}
