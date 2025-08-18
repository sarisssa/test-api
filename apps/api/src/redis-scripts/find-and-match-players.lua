--[[
  Find and match the two oldest players in the queue
  
  KEYS[1] - matchmaking queue zset key
  KEYS[2] - player key prefix for storing player data
  
  ARGV[1] - match ID to assign
  ARGV[2] - status to set ('matched')
  
  Returns: {player1, player2} or {} if not enough players
--]]

-- Get the 2 oldest players within queue
local players = redis.call('ZRANGE', KEYS[1], 0, 1, 'WITHSCORES')

-- Check if we have enough players (2 players + 2 scores = 4 elements)
if #players >= 4 then
    local player1 = players[1]
    local player2 = players[3]
    
    -- Remove players from queue
    redis.call('ZREM', KEYS[1], player1, player2)
    
    -- Update player statuses atomically
    redis.call('HSET', KEYS[2] .. player1, 'status', ARGV[2], 'matchId', ARGV[1])
    redis.call('HSET', KEYS[2] .. player2, 'status', ARGV[2], 'matchId', ARGV[1])
    
    -- Return the matched players
    return {player1, player2}
end

-- Not enough players
return {} 