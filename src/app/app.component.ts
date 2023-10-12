import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SongService } from './services/song.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  songs: any;

  constructor(private readonly songService: SongService) {
    this.songService.getSongs();
  }
}
