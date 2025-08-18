export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class MatchValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'MatchValidationError';
  }
}

export class AssetValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

export class MaxAssetsReachedError extends AssetValidationError {
  constructor(
    message: string = 'You have already selected the maximum number of assets.'
  ) {
    super(message);
    this.name = 'MaxAssetsReachedError';
  }
}

export class NotEnoughAssetsError extends AssetValidationError {
  constructor(
    message: string = 'Player has not selected enough assets to be ready.'
  ) {
    super(message);
    this.name = 'NotEnoughAssetsError';
  }
}

export class DuplicateAssetError extends AssetValidationError {
  constructor(message: string = 'Asset already selected by you.') {
    super(message);
    this.name = 'DuplicateAssetError';
  }
}

export class IdenticalAssetSetError extends AssetValidationError {
  constructor(
    message: string = 'Cannot select an identical set of assets as opponent.'
  ) {
    super(message);
    this.name = 'IdenticalAssetSetError';
  }
}

export class UnauthorizedMatchAccessError extends MatchValidationError {
  constructor(message: string = 'Not authorized for this match.') {
    super(message);
    this.name = 'UnauthorizedMatchAccessError';
  }
}

export class MatchNotFoundError extends MatchValidationError {
  constructor(message: string = 'Match not found.') {
    super(message);
    this.name = 'MatchNotFoundError';
  }
}
