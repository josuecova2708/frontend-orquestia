import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToscaniniChatComponent } from './shared/components/toscanini-chat/toscanini-chat';

@Component({
  selector: 'orq-root',
  imports: [RouterOutlet, ToscaniniChatComponent],
  template: `
    <router-outlet />
    <app-toscanini-chat />
  `,
  styles: `:host { display: block; height: 100vh; }`
})
export class App {}
