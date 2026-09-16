export class LatestRequestGate {
  private latestRequest = 0;
  private inFlight = false;

  begin(): number {
    this.latestRequest += 1;
    this.inFlight = true;
    return this.latestRequest;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.latestRequest;
  }

  get isBusy(): boolean {
    return this.inFlight;
  }

  finish(requestId: number): boolean {
    if (!this.isCurrent(requestId)) return false;
    this.inFlight = false;
    return true;
  }
}
